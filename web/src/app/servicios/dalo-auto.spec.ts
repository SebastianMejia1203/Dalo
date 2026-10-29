import { TestBed } from '@angular/core/testing';
import { DaloService } from './dalo';
import { ModeloReconocimientoService, MetadatosModelo } from './modelo-reconocimiento';
import type { FotogramaVivo } from './seguimiento';

const METADATOS: MetadatosModelo = {
  clases: ['chao', 'perfecto', 'otra'],
  fotogramas: 48,
  caracteristicas: Array.from({ length: 151 }, (_, i) => `c${i}`),
  media: Array.from({ length: 151 }, () => 0),
  desviacion: Array.from({ length: 151 }, () => 1),
  version_caracteristicas: 2,
};

function fotograma(): FotogramaVivo {
  const punto: [number, number, number] = [0.1, 0.2, 0.3];
  return {
    pose: [],
    manoIzquierda: null,
    manoDerecha: null,
    poseMundo: Array.from({ length: 33 }, () => [...punto] as [number, number, number]),
    manoIzquierdaMundo: Array.from({ length: 21 }, () => [...punto] as [number, number, number]),
    manoDerechaMundo: Array.from({ length: 21 }, () => [...punto] as [number, number, number]),
  };
}

function fotogramaSinManos(): FotogramaVivo {
  return { ...fotograma(), manoIzquierdaMundo: null, manoDerechaMundo: null };
}

async function asentar(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('DaloService detección automática con modelo entrenado', () => {
  let dalo: DaloService;
  let logitos = new Float32Array([3, 0, 0]);

  beforeEach(() => {
    TestBed.configureTestingModule({});
    dalo = TestBed.inject(DaloService);
    const modelo = TestBed.inject(ModeloReconocimientoService);
    logitos = new Float32Array([3, 0, 0]);
    modelo.establecerSesionParaPruebas(
      { run: async () => ({ logitos: { data: logitos } }) },
      METADATOS,
    );
    dalo.marcarModeloListo(true);
    dalo.camara.set('activa');
  });

  async function alimentar(cantidad: number, base: number, conManos = true): Promise<void> {
    for (let i = 0; i < cantidad; i++) {
      dalo.alimentarFotograma(conManos ? fotograma() : fotogramaSinManos(), base + i * 300);
      await asentar();
    }
  }

  it('identifica la seña sola, sin captura manual', async () => {
    await alimentar(30, 1_700_000_000_000);
    expect(dalo.faseLsc()).toBe('candidata');
    expect(dalo.candidataId()).toBe('chao');
  });

  it('no propone nada cuando la detección está en pausa', async () => {
    dalo.alternarDeteccionAutomatica();
    await alimentar(30, 1_700_000_000_000);
    expect(dalo.faseLsc()).toBe('reposo');
    expect(dalo.candidataId()).toBeNull();
  });

  it('vuelve a reposo tras repetir y permite una nueva detección', async () => {
    await alimentar(30, 1_700_000_000_000);
    expect(dalo.faseLsc()).toBe('candidata');
    dalo.repetirCaptura();
    expect(dalo.faseLsc()).toBe('reposo');
    await alimentar(30, Date.now() + 5000);
    expect(dalo.candidataId()).toBe('chao');
  });

  it('sigue recibiendo fotogramas mientras se muestra una candidata', async () => {
    dalo.faseLsc.set('candidata');
    dalo.candidataId.set('chao');
    dalo.alimentarFotograma(fotograma(), 1_700_000_000_000);
    expect(dalo.exportarVentanaAuto()).toHaveLength(1);
    expect(dalo.candidataId()).toBe('chao');
  });

  it('reconoce otra seña después de confirmar, sin pulsar repetir', async () => {
    await alimentar(30, 1_700_000_000_000);
    expect(dalo.candidataId()).toBe('chao');
    dalo.confirmarCandidata();
    expect(dalo.turnos()).toEqual(['Chao']);
    logitos = new Float32Array([0, 3, 0]);
    await alimentar(30, Date.now() + 5000);
    expect(dalo.candidataId()).toBe('perfecto');
    expect(dalo.faseLsc()).toBe('candidata');
  });

  it('se recupera automáticamente tras una seña desconocida', async () => {
    logitos = new Float32Array([0, 0, 3]);
    await alimentar(30, 1_700_000_000_000);
    // La desconocida se confirma al bajar las manos (cierre del segmento).
    await alimentar(4, 1_700_000_010_000, false);
    expect(dalo.faseLsc()).toBe('desconocida');
    logitos = new Float32Array([3, 0, 0]);
    await alimentar(30, Date.now() + 5000);
    expect(dalo.candidataId()).toBe('chao');
  });

  it('no sustituye la propuesta si la siguiente seña llega sin bajar las manos', async () => {
    await alimentar(30, 1_700_000_000_000);
    expect(dalo.candidataId()).toBe('chao');
    // Sin reposo de manos, la segunda seña pertenece al mismo segmento:
    // no debe reemplazar la propuesta ni emitirse como nueva.
    logitos = new Float32Array([0, 3, 0]);
    await alimentar(20, 1_700_000_010_000);
    expect(dalo.candidataId()).toBe('chao');
  });

  it('emite la siguiente seña cuando las manos bajan y vuelven a subir', async () => {
    await alimentar(30, 1_700_000_000_000);
    expect(dalo.candidataId()).toBe('chao');
    const base = Date.now() + 5000;
    // Reposo de manos: cierra el segmento anterior.
    await alimentar(4, base, false);
    logitos = new Float32Array([0, 3, 0]);
    await alimentar(30, base + 5000);
    expect(dalo.candidataId()).toBe('perfecto');
  });

  it('no mezcla fotogramas sin manos con la seña siguiente', async () => {
    await alimentar(40, 1_700_000_000_000, false);
    logitos = new Float32Array([3, 0, 0]);
    await alimentar(30, Date.now() + 5000);
    expect(dalo.candidataId()).toBe('chao');
  });
});
