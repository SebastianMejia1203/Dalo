import { Injectable, signal } from '@angular/core';
import {
  SecuenciaMundo,
  extraerCaracteristicas,
  prepararClip,
} from '../reconocimiento/caracteristicas-lsc';

export interface MetadatosModelo {
  clases: string[];
  fotogramas: number;
  caracteristicas: string[];
  media: number[];
  desviacion: number[];
  version_caracteristicas: number;
}

export interface PrediccionModelo {
  clase: string;
  probabilidad: number;
  probabilidades: Record<string, number>;
}

/** Sesión mínima compatible con ONNX Runtime Web (inyectable en pruebas). */
export interface SesionModelo {
  run(feeds: Record<string, { data: Float32Array; dims: number[] }>): Promise<
    Record<string, { data: Float32Array }>
  >;
}

const MIN_FOTOGRAMAS_MODELO = 16;

/**
 * Ruta absoluta de los binarios WASM de ONNX Runtime. Debe ser absoluta:
 * con una ruta relativa ('ort/') el runtime intenta importar el módulo
 * 'ort/ort-wasm-….mjs' como especificador y la carga falla.
 */
export function resolverRutaWasm(baseUri: string): string {
  return new URL('ort/', baseUri).href;
}

function softmax(logitos: Float32Array): number[] {
  const maximo = Math.max(...logitos);
  const exps = Array.from(logitos, (v) => Math.exp(v - maximo));
  const suma = exps.reduce((a, b) => a + b, 0);
  return exps.map((v) => v / suma);
}

/** Carga el modelo ONNX entrenado (Chao/Perfecto/otra) y clasifica secuencias. */
@Injectable({ providedIn: 'root' })
export class ModeloReconocimientoService {
  readonly cargando = signal(false);
  readonly errorCarga = signal('');
  readonly metadatos = signal<MetadatosModelo | null>(null);

  private sesion: SesionModelo | null = null;
  private cargaEnCurso: Promise<boolean> | null = null;

  get listas(): boolean {
    return this.sesion !== null && this.metadatos() !== null;
  }

  /** Carga metadatos y sesión ONNX desde `public/modelo-reconocimiento/`. */
  async cargar(
    fetchFn: typeof fetch = globalThis.fetch.bind(globalThis),
    base = 'modelo-reconocimiento/',
  ): Promise<boolean> {
    if (this.listas) return true;
    if (this.cargaEnCurso) return this.cargaEnCurso;
    this.cargaEnCurso = (async () => {
      this.cargando.set(true);
      this.errorCarga.set('');
      try {
        const respuesta = await fetchFn(`${base}modelo.json`);
        if (!respuesta.ok) throw new Error(`modelo.json: ${respuesta.status}`);
        const metadatos = (await respuesta.json()) as MetadatosModelo;
        if (
          !Array.isArray(metadatos.clases) ||
          !Array.isArray(metadatos.media) ||
          metadatos.media.length !== metadatos.desviacion.length
        ) {
          throw new Error('Metadatos del modelo incompletos.');
        }
        // Submódulo solo-WASM: el paquete principal usa la variante JSEP
        // (WebGPU) y pide binarios distintos de los servidos en `ort/`.
        const ort = await import('onnxruntime-web/wasm');
        // Los binarios WASM se sirven desde `public/ort/` (copiados del
        // paquete onnxruntime-web); sin esta ruta el runtime los busca
        // en la raíz de la página y falla con 404.
        ort.env.wasm.wasmPaths = resolverRutaWasm(document.baseURI);
        ort.env.wasm.numThreads = 1;
        const sesion = await ort.InferenceSession.create(`${base}modelo.onnx`, {
          executionProviders: ['wasm'],
        });
        this.sesion = {
          run: async (feeds) => {
            const tensor = new ort.Tensor('float32', feeds['secuencia'].data, feeds['secuencia'].dims);
            const salida = await sesion.run({ secuencia: tensor });
            const logitos = salida['logitos'];
            if (!logitos) throw new Error('El modelo no devolvió logitos.');
            return { logitos: { data: logitos.data as Float32Array } };
          },
        };
        this.metadatos.set(metadatos);
        return true;
      } catch (error) {
        // El detalle queda en consola para poder diagnosticar la causa real.
        console.error('No se pudo cargar el modelo de reconocimiento.', error);
        this.sesion = null;
        this.errorCarga.set('No se pudo cargar el modelo de reconocimiento. Revisa tu conexión y vuelve a intentarlo.');
        return false;
      } finally {
        this.cargando.set(false);
        this.cargaEnCurso = null;
      }
    })();
    return this.cargaEnCurso;
  }

  /** Punto de inyección para pruebas: sustituye la sesión ONNX y los metadatos. */
  establecerSesionParaPruebas(sesion: SesionModelo, metadatos: MetadatosModelo): void {
    this.sesion = sesion;
    this.metadatos.set(metadatos);
    this.errorCarga.set('');
  }

  /** Clasifica una ventana de landmarks mundiales; `null` si aún no se puede. */
  async clasificar(secuencia: SecuenciaMundo): Promise<PrediccionModelo | null> {
    const metadatos = this.metadatos();
    if (!this.sesion || !metadatos) return null;
    if (secuencia.poseMundo.length < MIN_FOTOGRAMAS_MODELO) return null;
    const caracteristicas = extraerCaracteristicas(secuencia);
    const clip = prepararClip(caracteristicas, metadatos.fotogramas);
    const dimensiones = metadatos.media.length;
    const datos = new Float32Array(metadatos.fotogramas * dimensiones);
    for (let t = 0; t < metadatos.fotogramas; t++) {
      for (let d = 0; d < dimensiones; d++) {
        const valor = clip[t][d];
        datos[t * dimensiones + d] = (valor - metadatos.media[d]) / (metadatos.desviacion[d] || 1);
      }
    }
    const salida = await this.sesion.run({
      secuencia: { data: datos, dims: [1, metadatos.fotogramas, dimensiones] },
    });
    const logitos = salida['logitos']?.data;
    if (!logitos) return null;
    const probabilidades = softmax(logitos);
    let mejor = 0;
    for (let i = 1; i < probabilidades.length; i++) {
      if (probabilidades[i] > probabilidades[mejor]) mejor = i;
    }
    const porClase: Record<string, number> = {};
    metadatos.clases.forEach((clase, i) => {
      porClase[clase] = probabilidades[i] ?? 0;
    });
    return {
      clase: metadatos.clases[mejor] ?? 'otra',
      probabilidad: probabilidades[mejor] ?? 0,
      probabilidades: porClase,
    };
  }
}
