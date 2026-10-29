import { Injectable } from '@angular/core';
import type { VRM } from '@pixiv/three-vrm';
import type { VRMAnimation } from '@pixiv/three-vrm-animation';
import type { Scene } from 'three';
import { crearConservadorCodos, type ConservadorCodos } from './volumen-codos';

type ModuloThree = typeof import('three');
type ModuloVrm = typeof import('@pixiv/three-vrm');
type ModuloOrbit = typeof import('three/addons/controls/OrbitControls.js');

/** AvatarSample_1 (VRoid, CC0), con pesos y superficie ajustados en los codos. */
export const URL_MODELO_AVATAR = 'avatar/avatar-sample-1-superficie-codos.vrm';

export interface ModeloAvatarCargado {
  three: ModuloThree;
  vrmModulo: ModuloVrm;
  orbitModulo: ModuloOrbit;
  vrm: VRM;
  /** Escena única con luces y el VRM: todos los lienzos la renderizan. */
  escena: Scene;
  conservadorCodos: ConservadorCodos;
}

/**
 * Carga única del modelo 3D y sus módulos (Three.js, three-vrm, GLTFLoader).
 * `precargar()` se llama al entrar a la página para descargar en segundo
 * plano; todos los avatares reutilizan la misma instancia (un solo VRM y
 * una sola escena) sin volver a descargar. Cada lienzo tiene su propio
 * renderer y cámara, pero renderiza la escena compartida: un `Object3D`
 * solo puede estar en una escena, por eso no se añade el VRM a escenas
 * por componente. Solo una tarjeta a la vez ejecuta su animación (hover).
 */
@Injectable({ providedIn: 'root' })
export class ModeloAvatarService {
  private carga: Promise<ModeloAvatarCargado> | null = null;
  private animaciones = new Map<string, Promise<VRMAnimation>>();
  private secuencias = new Map<string, Promise<unknown>>();
  /**
   * Puerta del trabajo pesado (descargas y parseo). Mientras está cerrada,
   * las vistas se montan al instante con su estado "Cargando" y la
   * interacción nunca se bloquea; al abrirse, todo lo pendiente avanza con
   * la caché compartida (una sola vez).
   */
  private puerta: Promise<void> | null = null;

  /**
   * Retiene el trabajo pesado hasta después del primer pintado. Llamar una
   * sola vez al entrar a la página, antes de precargar.
   */
  retenerCargaTrasPintado(): void {
    if (this.puerta) return;
    let abrir!: () => void;
    this.puerta = new Promise<void>((resolve) => {
      abrir = resolve;
    });
    const liberar = (): void => abrir();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(liberar, 0));
    } else {
      setTimeout(liberar, 0);
    }
  }

  private esperarPuerta(): Promise<void> {
    return this.puerta ?? Promise.resolve();
  }

  /** Inicia la descarga en segundo plano; seguro llamarlo varias veces. */
  precargar(): void {
    void this.obtenerModelo().catch(() => {
      // Se reintentará cuando el avatar lo necesite.
      this.carga = null;
    });
  }

  /**
   * Precarga única al entrar a la página: modelo, animaciones y secuencias
   * JSON del catálogo. Todo queda en caché; las vistas no descargan nada.
   * Solo se usa `avatarUrl` cuando no hay `animacionUrl` (la animación
   * tiene prioridad y el JSON quedaría sin uso).
   */
  precargarCatalogo(entradas: readonly { animacionUrl: string | null; avatarUrl: string | null }[]): void {
    this.precargar();
    const animaciones: (string | null)[] = [];
    const secuencias: (string | null)[] = [];
    for (const entrada of entradas) {
      if (entrada.animacionUrl) animaciones.push(entrada.animacionUrl);
      else if (entrada.avatarUrl) secuencias.push(entrada.avatarUrl);
    }
    this.precargarAnimaciones(animaciones);
    this.precargarSecuencias(secuencias);
  }

  /** Resuelve con los módulos y el modelo; comparte una única carga. */
  obtenerModelo(): Promise<ModeloAvatarCargado> {
    if (!this.carga) {
      // La asignación es síncrona: aunque varios llamen a la vez mientras
      // la puerta está cerrada, el trabajo pesado ocurre una sola vez.
      this.carga = (async (): Promise<ModeloAvatarCargado> => {
        await this.esperarPuerta();
        return this.cargar();
      })();
    }
    return this.carga;
  }

  /**
   * Carga una animación VRM (.vrma), independiente del archivo del avatar.
   * Cada URL se descarga y procesa una sola vez.
   */
  obtenerAnimacion(url: string): Promise<VRMAnimation> {
    const pendiente = this.animaciones.get(url);
    if (pendiente) return pendiente;
    const carga = (async (): Promise<VRMAnimation> => {
      await this.esperarPuerta();
      try {
        return await this.cargarAnimacion(url);
      } catch (error: unknown) {
        this.animaciones.delete(url);
        throw error;
      }
    })();
    this.animaciones.set(url, carga);
    return carga;
  }

  /**
   * Precarga las animaciones del catálogo. Los fallos se ignoran: la
   * tarjeta lo reintentará al mostrarse.
   */
  precargarAnimaciones(urls: readonly (string | null)[]): void {
    for (const url of urls) {
      if (!url) continue;
      void this.obtenerAnimacion(url).catch(() => undefined);
    }
  }

  /**
   * Secuencia JSON de puntos ya descargada (caché por URL). Cada URL se
   * descarga una sola vez en toda la sesión; los fallos no se cachean.
   */
  obtenerSecuencia(url: string): Promise<unknown> {
    const pendiente = this.secuencias.get(url);
    if (pendiente) return pendiente;
    const carga = (async (): Promise<unknown> => {
      await this.esperarPuerta();
      try {
        const respuesta = await fetch(url);
        if (!respuesta.ok) throw new Error(String(respuesta.status));
        const datos: unknown = await respuesta.json();
        return datos;
      } catch (error: unknown) {
        this.secuencias.delete(url);
        throw error;
      }
    })();
    this.secuencias.set(url, carga);
    return carga;
  }

  /** Precarga las secuencias JSON que sí se usan (sin animación .vrma). */
  precargarSecuencias(urls: readonly (string | null)[]): void {
    for (const url of urls) {
      if (!url) continue;
      void this.obtenerSecuencia(url).catch(() => undefined);
    }
  }

  private async cargar(): Promise<ModeloAvatarCargado> {
    const [three, vrmModulo, animacionModulo, gltfModulo, orbitModulo] = await Promise.all([
      import('three'),
      import('@pixiv/three-vrm'),
      import('@pixiv/three-vrm-animation'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
    ]);
    const cargador = new gltfModulo.GLTFLoader();
    cargador.register((parser) => new vrmModulo.VRMLoaderPlugin(parser));
    const respuesta = await fetch(URL_MODELO_AVATAR);
    if (!respuesta.ok) throw new Error(`Modelo no disponible: ${respuesta.status}`);
    const datos = await respuesta.arrayBuffer();
    const gltf = await cargador.parseAsync(datos, '');
    const vrm = gltf.userData['vrm'] as VRM | undefined;
    if (!vrm) throw new Error('El archivo no contiene un VRM válido.');
    // Los VRM 0.x miran hacia -Z: se giran para que queden de frente.
    vrmModulo.VRMUtils.rotateVRM0(vrm);
    // Necesario para reproducir la pista lookAt de los .vrma sin el aviso
    // "VRMLookAtQuaternionProxy is not found. Creating a new one automatically".
    if (vrm.lookAt && !vrm.scene.getObjectByName('lookAtQuaternionProxy')) {
      const proxy = new animacionModulo.VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = 'lookAtQuaternionProxy';
      vrm.scene.add(proxy);
    }
    vrm.scene.updateMatrixWorld(true);
    const conservadorCodos = crearConservadorCodos(three, vrm.scene);
    // Escena compartida: las luces viven aquí una sola vez y el VRM se
    // añade una sola vez; cada componente solo aporta renderer y cámara.
    const escena = new three.Scene();
    escena.background = new three.Color(0xffffff);
    escena.add(new three.HemisphereLight(0xffffff, 0xdfe8f0, 1.5));
    const clave = new three.DirectionalLight(0xffffff, 1.6);
    clave.position.set(2, 3, 4);
    escena.add(clave);
    const relleno = new three.DirectionalLight(0xeaf2ff, 0.6);
    relleno.position.set(-3, 1, 2);
    escena.add(relleno);
    escena.add(vrm.scene);
    return { three, vrmModulo, orbitModulo, vrm, escena, conservadorCodos };
  }

  private async cargarAnimacion(url: string): Promise<VRMAnimation> {
    const [animacionModulo, gltfModulo] = await Promise.all([
      import('@pixiv/three-vrm-animation'),
      import('three/addons/loaders/GLTFLoader.js'),
    ]);
    const cargador = new gltfModulo.GLTFLoader();
    cargador.register((parser) => new animacionModulo.VRMAnimationLoaderPlugin(parser));
    const gltf = await cargador.loadAsync(url);
    const animaciones = gltf.userData['vrmAnimations'] as unknown as VRMAnimation[] | undefined;
    const animacion = animaciones?.[0];
    if (!animacion) throw new Error('El archivo no contiene una animación VRM válida.');
    return animacion;
  }
}
