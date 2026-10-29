import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import {
  ArrowDown,
  ArrowUp,
  Focus,
  LucideAngularModule,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  ZoomIn,
  ZoomOut,
} from 'lucide-angular';

import { AvatarLsc, PuntoAvatar, SecuenciaAvatar, calcularEncuadre, fotogramaEn, validarSecuencia } from './avatar-lsc';
import { ModeloAvatarService } from './modelo-avatar';
import type { ModeloAvatarCargado } from './modelo-avatar';

const SECUENCIA_VALIDA = {
  version: 1,
  id: 'hola',
  nombre: 'Hola',
  fps: 30,
  fotogramas: [
    { pose: [[0.5, 0.2, 0]], manoIzquierda: [[0.3, 0.5, 0]], manoDerecha: null },
    { pose: [[0.7, 0.2, 0]], manoIzquierda: [[0.5, 0.5, 0]], manoDerecha: null },
  ],
};

describe('validarSecuencia', () => {
  it('acepta una secuencia bien formada', () => {
    const secuencia = validarSecuencia(SECUENCIA_VALIDA);
    expect(secuencia?.fotogramas).toHaveLength(2);
    expect(secuencia?.fps).toBe(30);
  });

  it('rechaza datos que no son una secuencia', () => {
    expect(validarSecuencia(null)).toBeNull();
    expect(validarSecuencia({})).toBeNull();
    expect(validarSecuencia({ ...SECUENCIA_VALIDA, fps: 0 })).toBeNull();
    expect(validarSecuencia({ ...SECUENCIA_VALIDA, fotogramas: [] })).toBeNull();
    expect(
      validarSecuencia({
        ...SECUENCIA_VALIDA,
        fotogramas: [{ pose: [['x', 0, 0]], manoIzquierda: null, manoDerecha: null }],
      }),
    ).toBeNull();
  });
});

describe('fotogramaEn', () => {
  it('interpola entre fotogramas vecinos y respeta los extremos', () => {
    const secuencia = validarSecuencia(SECUENCIA_VALIDA) as SecuenciaAvatar;
    expect(fotogramaEn(secuencia, 0).pose[0]).toEqual([0.5, 0.2, 0]);
    expect(fotogramaEn(secuencia, 0.5).pose[0]?.[0]).toBeCloseTo(0.6);
    expect(fotogramaEn(secuencia, 99).pose[0]).toEqual([0.7, 0.2, 0]);
    expect(fotogramaEn(secuencia, 0.5).manoDerecha).toBeNull();
  });

  it('suaviza el tramo con easing cúbico (frena al llegar a cada clave)', () => {
    const secuencia = validarSecuencia(SECUENCIA_VALIDA) as SecuenciaAvatar;
    // smoothstep(0.25) = 0.15625: 0.5 + 0.2 * 0.15625 = 0.53125 (lineal daría 0.55).
    expect(fotogramaEn(secuencia, 0.25).pose[0]?.[0]).toBeCloseTo(0.53125);
    expect(fotogramaEn(secuencia, 0.75).pose[0]?.[0]).toBeCloseTo(0.66875);
  });
});

describe('calcularEncuadre', () => {
  it('usa los hombros como origen y escala por su ancho', () => {
    const pose: (PuntoAvatar | null)[] = Array.from({ length: 33 }, () => null);
    pose[0] = [0.5, 0.25, 0];
    pose[11] = [0.4, 0.4, 0];
    pose[12] = [0.6, 0.4, 0];
    pose[23] = [0.42, 0.7, 0];
    pose[24] = [0.58, 0.7, 0];
    const secuencia: SecuenciaAvatar = {
      version: 1,
      id: 'prueba',
      nombre: 'Prueba',
      fps: 30,
      fotogramas: [{ pose, manoIzquierda: null, manoDerecha: null }],
    };
    const encuadre = calcularEncuadre(secuencia);
    expect(encuadre.origen[0]).toBeCloseTo(0.5);
    expect(encuadre.origen[1]).toBeCloseTo(0.4);
    expect(encuadre.escala).toBeCloseTo(0.85 / (0.2 * (640 / 360)));
    expect(encuadre.altura).toBeGreaterThan(1);
    expect(encuadre.centro[1]).toBeLessThan(0);
  });
});

describe('AvatarLsc', () => {
  let fixture: ComponentFixture<AvatarLsc>;

  beforeEach(async () => {
    // El modelo 3D real (VRM binario + WebGL) no existe en jsdom: se sustituye
    // solo `obtenerModelo` por un falso con la misma forma. Las secuencias y
    // animaciones siguen pasando por `fetch` para que cada prueba controle su
    // red con stubs.
    const three = await import('three');
    const orbitModulo = await import('three/addons/controls/OrbitControls.js');
    const vrmFalso = {
      humanoid: {
        resetNormalizedPose: (): void => undefined,
        getNormalizedBoneNode: (): null => null,
      },
      lookAt: null,
      scene: new three.Scene(),
      update: (): void => undefined,
    };
    const modeloFalso = {
      three,
      vrmModulo: {},
      orbitModulo,
      vrm: vrmFalso,
      escena: new three.Scene(),
      conservadorCodos: { actualizar: (): void => undefined },
    } as unknown as ModeloAvatarCargado;
    const servicioFalso = {
      obtenerSecuencia: async (url: string): Promise<unknown> => {
        const respuesta = await fetch(url);
        if (!respuesta.ok) throw new Error(String(respuesta.status));
        return respuesta.json() as Promise<unknown>;
      },
      obtenerAnimacion: async (url: string): Promise<never> => {
        await fetch(url);
        throw new Error('sin animación en pruebas');
      },
      obtenerModelo: async (): Promise<ModeloAvatarCargado> => modeloFalso,
    };
    await TestBed.configureTestingModule({
      imports: [AvatarLsc],
      providers: [
        { provide: ModeloAvatarService, useValue: servicioFalso },
        importProvidersFrom(
          LucideAngularModule.pick({
            ArrowDown,
            ArrowUp,
            Focus,
            Pause,
            Play,
            RefreshCw,
            RotateCcw,
            RotateCw,
            SkipBack,
            SkipForward,
            StepBack,
            StepForward,
            ZoomIn,
            ZoomOut,
          }),
        ),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AvatarLsc);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no acumula acciones al reutilizar el reproductor para distintas señas', async () => {
    const { VRMAnimation } = await import('@pixiv/three-vrm-animation');
    const modelo = await TestBed.inject(ModeloAvatarService).obtenerModelo();
    const vrm = { ...modelo.vrm, meta: { metaVersion: '0' } } as unknown as typeof modelo.vrm;
    const reproductor = fixture.componentInstance as unknown as {
      prepararClip(animacion: InstanceType<typeof VRMAnimation>, avatar: typeof vrm): Promise<void>;
      mixer: import('three').AnimationMixer;
    };
    for (let i = 0; i < 8; i++) {
      const animacion = new VRMAnimation();
      animacion.duration = 1;
      await reproductor.prepararClip(animacion, vrm);
    }
    expect(reproductor.mixer.stats.actions.total).toBe(1);
  });

  it('sin URL muestra avatar no disponible', async () => {
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Avatar aún no disponible');
  });

  it('no crea un contexto tardío si el componente se destruye mientras carga el modelo', async () => {
    const servicio = TestBed.inject(ModeloAvatarService);
    const modelo = await servicio.obtenerModelo();
    let resolver!: (modelo: ModeloAvatarCargado) => void;
    vi.spyOn(servicio, 'obtenerModelo').mockReturnValue(new Promise((resolve) => { resolver = resolve; }));
    const contexto = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      const interno = fixture.componentInstance as unknown as {
        asegurarEscena(lienzo: HTMLCanvasElement): Promise<void>;
      };
      const carga = interno.asegurarEscena(document.createElement('canvas'));
      fixture.destroy();
      resolver(modelo);
      await carga;
      expect(contexto).not.toHaveBeenCalled();
    } finally {
      contexto.mockRestore();
    }
  });

  it('agrupa cambios de cámara y mantiene la inercia aunque la animación esté pausada', async () => {
    const { three, orbitModulo } = await TestBed.inject(ModeloAvatarService).obtenerModelo();
    const lienzo = document.createElement('canvas');
    lienzo.setPointerCapture = () => undefined;
    lienzo.releasePointerCapture = () => undefined;
    Object.defineProperty(lienzo, 'clientHeight', { value: 360 });
    Object.defineProperty(lienzo, 'clientWidth', { value: 640 });
    document.body.append(lienzo);
    const pendientes = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', vi.fn((paso: FrameRequestCallback) => {
      pendientes.set(++id, paso);
      return id;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((valor: number) => pendientes.delete(valor)));
    const dibujar = vi.fn();
    const camara = new three.PerspectiveCamera(32, 640 / 360, .1, 100);
    camara.position.set(0, 1, 2);
    const interno = fixture.componentInstance as unknown as {
      three: typeof three;
      camara: typeof camara;
      escena: import('three').Scene;
      renderer: unknown;
      controles: import('three/addons/controls/OrbitControls.js').OrbitControls;
      configurarControles(modulo: typeof orbitModulo, canvas: HTMLCanvasElement): void;
    };
    interno.three = three;
    interno.camara = camara;
    interno.escena = new three.Scene();
    interno.renderer = { render: dibujar, dispose: () => undefined, forceContextLoss: () => undefined };
    interno.configurarControles(orbitModulo, lienzo);
    const evento = (tipo: string, x: number) => {
      const evento = new MouseEvent(tipo, { clientX: x, clientY: 180, button: 0, buttons: 1, bubbles: true });
      Object.defineProperties(evento, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
      return evento;
    };
    try {
      lienzo.dispatchEvent(evento('pointerdown', 320));
      document.dispatchEvent(evento('pointermove', 360));
      document.dispatchEvent(evento('pointermove', 390));
      document.dispatchEvent(evento('pointerup', 390));
      expect(dibujar).not.toHaveBeenCalled();
      expect(pendientes.size).toBe(1);
      const avanzar = () => {
        const turno = pendientes.entries().next().value!;
        pendientes.delete(turno[0]);
        turno[1](performance.now());
      };
      const antes = camara.position.clone();
      avanzar();
      expect(dibujar).toHaveBeenCalledTimes(1);
      expect(camara.position.distanceTo(antes)).toBeGreaterThan(0);
      expect(pendientes.size).toBe(1);
      avanzar();
      expect(dibujar).toHaveBeenCalledTimes(2);
      let pasos = 0;
      while (pendientes.size && pasos++ < 250) avanzar();
      expect(pendientes.size).toBe(0);
    } finally {
      fixture.destroy();
      expect(pendientes.size).toBe(0);
      lienzo.remove();
    }
  });

  it('cambia de seña sin destruir el lienzo (sin parpadeo)', async () => {
    const secuencia = (id: string, x: number): unknown => ({
      version: 1,
      id,
      nombre: id,
      fps: 30,
      fotogramas: [
        { pose: [[x, 0.2, 0]], manoIzquierda: null, manoDerecha: null },
        { pose: [[x + 0.1, 0.2, 0]], manoIzquierda: null, manoDerecha: null },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes('b.json') ? secuencia('b', 0.6) : secuencia('a', 0.4)),
      })),
    );
    fixture.componentRef.setInput('secuenciaUrl', 'avatar/a.json');
    fixture.componentRef.setInput('nombre', 'A');
    await fixture.whenStable();
    fixture.detectChanges();
    const lienzoAntes = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement | null;
    expect(lienzoAntes).toBeTruthy();

    fixture.componentRef.setInput('secuenciaUrl', 'avatar/b.json');
    fixture.componentRef.setInput('nombre', 'B');
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    // El lienzo anterior sigue montado: no pasa por "Cargando".
    expect(fixture.nativeElement.querySelector('canvas')).toBe(lienzoAntes);
    expect(texto).not.toContain('Cargando avatar');
    expect(texto).toContain('Pausar');
  });

  it('con URL válida carga la secuencia y muestra controles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => SECUENCIA_VALIDA })),
    );
    fixture.componentRef.setInput('secuenciaUrl', 'avatar/hola.json');
    fixture.componentRef.setInput('nombre', 'Hola');
    await fixture.whenStable();
    fixture.detectChanges();
    const texto = fixture.nativeElement.textContent as string;
    // Sin reduced-motion simulado, la secuencia arranca en reproducción.
    expect(texto).toContain('Pausar');
    expect(texto).toContain('Repetir');
    expect(texto).toContain('Restablecer vista');
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
    for (const etiqueta of [
      'Acercar la vista',
      'Alejar la vista',
      'Girar a la izquierda',
      'Girar a la derecha',
      'Subir la vista',
      'Bajar la vista',
    ]) {
      const boton = fixture.nativeElement.querySelector(`[aria-label="${etiqueta}"]`) as HTMLElement | null;
      expect(boton).toBeTruthy();
      // Sin WebGL en pruebas: los controles de vista no deben fallar.
      boton?.click();
    }
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('canvas')).toBeTruthy();
  });

  it(
    'con animacionUrl descarga el .vrma y muestra error si falla',
    { timeout: 30000 },
    async () => {
      const fetchFalso = vi.fn(async () => {
        throw new Error('sin red');
      });
      vi.stubGlobal('fetch', fetchFalso);
      // URL absoluta: en jsdom new Request() exige base para las relativas.
      fixture.componentRef.setInput('animacionUrl', 'http://localhost/avatar/prueba.vrma');
      fixture.componentRef.setInput('nombre', 'Prueba');
      await fixture.whenStable();
      fixture.detectChanges();
      // La descarga del .vrma se intenta aunque el modelo aún no esté listo.
      const urlsDescargadas = (): string[] =>
        fetchFalso.mock.calls.map((args: unknown[]) => {
          const primero = args[0] as { url?: unknown } | string;
          if (typeof primero === 'string') return primero;
          return String(primero?.url ?? primero);
        });
      await vi.waitFor(
        () => expect(urlsDescargadas().some((url) => url.includes('prueba.vrma'))).toBe(true),
        { timeout: 20000 },
      );
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        'No se pudo cargar el avatar',
      );
    },
  );

  it('con URL que falla muestra error accesible', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => null })),
    );
    fixture.componentRef.setInput('secuenciaUrl', 'avatar/no-existe.json');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo cargar el avatar',
    );
  });

  it('la velocidad ajusta el avance de la reproducción', async () => {
    await fixture.whenStable();
    // Inyección directa de estado: no depende de la descarga del modelo 3D.
    const instancia = fixture.componentInstance as unknown as {
      secuencia: { set(secuencia: unknown): void };
      velocidad: { (): number; set(valor: number): void };
      posicion: () => number;
      cambiarVelocidad: (evento: Event) => void;
      iniciar: () => void;
      detener: () => void;
    };
    const fotogramas = Array.from({ length: 301 }, () => ({
      pose: [[0.5, 0.2, 0]],
      manoIzquierda: null,
      manoDerecha: null,
    }));
    instancia.secuencia.set({ ...SECUENCIA_VALIDA, fps: 30, fotogramas });

    const turnos: Array<(instante: number) => void> = [];
    let siguienteId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((paso: (instante: number) => void) => {
        turnos.push(paso);
        siguienteId += 1;
        return siguienteId;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn(() => undefined));
    let ahora = 1000;
    const espiarAhora = vi.spyOn(performance, 'now').mockImplementation(() => ahora);
    try {
      instancia.iniciar();
      expect(turnos.length).toBeGreaterThan(0);
      const avanzar = (ms: number): void => {
        ahora += ms;
        espiarAhora.mockImplementation(() => ahora);
        const paso = turnos.pop();
        expect(paso).toBeDefined();
        paso?.(ahora);
      };

      // A 1×: 0,1 s * 30 fps = 3 fotogramas.
      avanzar(100);
      const base = instancia.posicion();
      expect(base).toBeCloseTo(3, 0);

      // Cambiar a 2× por el manejador del select: el avance se duplica.
      instancia.cambiarVelocidad({ target: { value: '2' } } as unknown as Event);
      expect(instancia.velocidad()).toBe(2);
      avanzar(100);
      expect(instancia.posicion() - base).toBeCloseTo(6, 0);

      // Valor inválido: se ignora y conserva la velocidad anterior.
      instancia.cambiarVelocidad({ target: { value: 'basura' } } as unknown as Event);
      expect(instancia.velocidad()).toBe(2);
    } finally {
      instancia.detener();
      espiarAhora.mockRestore();
    }
  });

  it('fijar el tiempo .vrma no aplica la velocidad dos veces', () => {
    // Réplica fiel de three (AnimationMixer.js): `setTime` reinicia y llama
    // a `update`, que multiplica por `timeScale`. Sin neutralizar la escala,
    // a 2× el tiempo se duplica (termina al instante) y a 0,5× se reduce a
    // la mitad en cada fijado (no se mueve).
    const crearMixerFiel = (): {
      time: number;
      timeScale: number;
      setTime(t: number): void;
      update(dt: number): void;
      stopAllAction(): void;
    } => {
      const mixer = {
        time: 0,
        timeScale: 1,
        update(dt: number): void {
          mixer.time += dt * mixer.timeScale;
        },
        setTime(t: number): void {
          mixer.time = 0;
          mixer.update(t);
        },
        stopAllAction(): void {
          // Solo para que `ngOnDestroy` no falle en pruebas.
        },
      };
      return mixer;
    };
    const instancia = fixture.componentInstance as unknown as {
      duracionAnimacion: { set(valor: number): void };
      posicion: { (): number; set(valor: number): void };
      velocidad: { (): number; set(valor: number): void };
      aplicarTiempoVrma: () => void;
    };
    const interno = fixture.componentInstance as unknown as { mixer: unknown; vrm: unknown };
    const mixer = crearMixerFiel();
    interno.mixer = mixer;
    interno.vrm = { update: (): void => undefined };
    // 2,6 s de clip: modo animación. Fotograma 30 = 1 s exacto a 30 fps.
    instancia.duracionAnimacion.set(2.6);
    instancia.posicion.set(30);

    instancia.velocidad.set(2);
    // El bucle ya habría puesto la escala del mixer a 2: el fijado no debe
    // alterarla ni aplicarla de más.
    mixer.timeScale = 2;
    instancia.aplicarTiempoVrma();
    expect(mixer.time).toBeCloseTo(1, 5);
    // La escala se restaura: el bucle de reproducción la necesita.
    expect(mixer.timeScale).toBe(2);

    instancia.velocidad.set(0.5);
    mixer.timeScale = 0.5;
    mixer.time = 99;
    instancia.aplicarTiempoVrma();
    expect(mixer.time).toBeCloseTo(1, 5);
    expect(mixer.timeScale).toBe(0.5);
  });

  it('la rueda y los botones comparten el mismo encuadre de zoom', () => {
    type Vec = {
      x: number;
      y: number;
      z: number;
      copy(v: Vec): Vec;
      lerp(v: Vec, t: number): Vec;
      distanceTo(v: Vec): number;
    };
    const crearVector = (x: number, y: number, z: number): Vec => ({
      x,
      y,
      z,
      copy(v: Vec): Vec {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
      },
      lerp(v: Vec, t: number): Vec {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        this.z += (v.z - this.z) * t;
        return this;
      },
      distanceTo(v: Vec): number {
        return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
      },
    });
    const interno = fixture.componentInstance as unknown as {
      camara: unknown;
      controles: unknown;
      vistaInicial: unknown;
      focoPechoCara: unknown;
      distanciaEncuadre: number;
      distanciaZoom: number;
      alinearFocoConZoom: () => void;
    };
    // Encuadre inicial a distancia 2 (mínimo 0,8), base en el origen y foco
    // en el pecho/cara. La cámara se mueve sobre el eje Z.
    const base = crearVector(0, 0, 0);
    const foco = crearVector(0, 0.5, 0);
    const objetivo = crearVector(0, 0, 0);
    const posicionCamara = crearVector(0, 0, 2);
    interno.camara = { position: posicionCamara };
    interno.controles = {
      target: objetivo,
      minDistance: 0.8,
      maxDistance: 6,
      dispose: (): void => undefined,
    };
    interno.vistaInicial = { posicion: crearVector(0, 0, 2), objetivo: base };
    interno.focoPechoCara = foco;
    interno.distanciaEncuadre = 2;
    interno.distanciaZoom = 2;

    // Al fondo (distancia inicial): objetivo exacto en la base.
    interno.alinearFocoConZoom();
    expect([objetivo.x, objetivo.y, objetivo.z]).toEqual([0, 0, 0]);

    // Acercado al mínimo (como la rueda o el botón): objetivo en el foco.
    posicionCamara.z = 0.8;
    interno.alinearFocoConZoom();
    expect(objetivo.x).toBeCloseTo(0, 5);
    expect(objetivo.y).toBeCloseTo(0.5, 5);
    expect(objetivo.z).toBeCloseTo(0, 5);

    // A mitad de recorrido el objetivo queda a mitad entre base y foco.
    // (Se parte de la base: la distancia se mide desde el objetivo actual.)
    objetivo.copy(base);
    posicionCamara.z = 1.4;
    interno.alinearFocoConZoom();
    expect(objetivo.y).toBeCloseTo(0.25, 5);

    // Más lejos que el encuadre inicial: se queda en la base (sin pasarla).
    posicionCamara.z = 4;
    interno.alinearFocoConZoom();
    expect([objetivo.x, objetivo.y, objetivo.z]).toEqual([0, 0, 0]);

    // Misma distancia (girar o desplazar la vista la conservan): no toca el
    // objetivo, así se preserva el paneo manual del usuario. Se parte del
    // estado estable y se mueven cámara y objetivo juntos, como hace el
    // paneo de OrbitControls.
    interno.distanciaZoom = posicionCamara.distanceTo(objetivo);
    posicionCamara.x += 1;
    posicionCamara.y += 1;
    objetivo.x += 1;
    objetivo.y += 1;
    interno.alinearFocoConZoom();
    expect([objetivo.x, objetivo.y, objetivo.z]).toEqual([1, 1, 0]);
  });
});
