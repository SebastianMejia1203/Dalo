import { TestBed } from '@angular/core/testing';
import { SeguimientoService } from './seguimiento';
import { FilesetResolver, HolisticLandmarker } from '@mediapipe/tasks-vision';
import { vi } from 'vitest';

describe('SeguimientoService', () => {
  let service: SeguimientoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SeguimientoService);
  });

  it('should be created with model idle', () => {
    expect(service).toBeTruthy();
    expect(service.estadoModelo()).toBe('inactivo');
    expect(service.muestras()).toEqual([]);
  });

  it('keeps an in-memory sequence with timestamps on capture', () => {
    service.iniciarCaptura();
    expect(service.capturando()).toBe(true);
    service.muestras.set([
      { t: 1700000000000, vt: 0.1, rostro: null, manoIzquierda: null, manoDerecha: null, pose: null },
      { t: 1700000000033, vt: 0.13, rostro: null, manoIzquierda: [{ x: 0.5, y: 0.5, z: 0 }], manoDerecha: null, pose: null },
    ]);
    expect(service.totalMuestras()).toBe(2);
    const primera = service.muestras()[0];
    expect(typeof primera?.t).toBe('number');
    service.detenerCaptura();
    expect(service.capturando()).toBe(false);
    expect(service.totalMuestras()).toBe(2);
  });

  it('clears the sequence', () => {
    service.iniciarCaptura();
    service.muestras.set([
      { t: 1, vt: 0, rostro: null, manoIzquierda: null, manoDerecha: null, pose: null },
    ]);
    service.limpiar();
    expect(service.muestras()).toEqual([]);
    expect(service.capturando()).toBe(false);
  });

  describe('live landmarks', () => {
    let siguiente: FrameRequestCallback;
    let puntos: Array<{ x: number; y: number; z: number; visibility: number }>;
    let video: HTMLVideoElement;

    beforeEach(async () => {
      puntos = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
      const detector = { detectForVideo: () => ({
        poseLandmarks: [puntos],
        poseWorldLandmarks: [Array.from({ length: 33 }, () => ({ x: -0.2, y: 0.9, z: 1.4, visibility: 1 }))],
        leftHandWorldLandmarks: [Array.from({ length: 21 }, () => ({ x: 0.0, y: -0.1, z: 0.02, visibility: 1 }))],
        rightHandWorldLandmarks: [Array.from({ length: 21 }, () => ({ x: 0.1, y: -0.1, z: 0.02, visibility: 1 }))],
        // La API JS rellena con cero la visibilidad omitida por estos modelos.
        leftHandLandmarks: [Array.from({ length: 21 }, () => ({ x: 0.4, y: 0.4, z: 0, visibility: 0 }))],
        faceLandmarks: [[{ x: 0.5, y: 0.2, z: 0, visibility: 0 }]],
      }) };
      vi.spyOn(FilesetResolver, 'forVisionTasks').mockResolvedValue({ wasmLoaderPath: '', wasmBinaryPath: '' });
      vi.spyOn(HolisticLandmarker, 'createFromOptions').mockResolvedValue(detector as unknown as HolisticLandmarker);
      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => { siguiente = cb; return 1; });
      vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => undefined);
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      video = document.createElement('video');
      Object.defineProperties(video, {
        readyState: { value: 2 }, videoWidth: { value: 640 }, videoHeight: { value: 480 },
      });
      await service.iniciarSeguimiento(video, document.createElement('canvas'));
    });

    afterEach(() => { service.detenerSeguimiento(); vi.restoreAllMocks(); });

    function cuadro(t: number): void { video.currentTime = t; siguiente(t * 1000); }

    it('exposes world landmarks (meters, may leave the 0..1 image range) for the trained model', () => {
      cuadro(0.1);
      const vivo = service.fotogramaEnVivo();
      expect(vivo?.poseMundo?.[0]).toEqual([-0.2, 0.9, 1.4]);
      expect(vivo?.poseMundo?.length).toBe(33);
      expect(vivo?.manoIzquierdaMundo?.length).toBe(21);
      expect(vivo?.manoDerechaMundo?.[0]).toEqual([0.1, -0.1, 0.02]);
    });

    it('keeps detected hands whose model does not supply per-point visibility', () => {
      cuadro(0.1);
      expect(service.fotogramaEnVivo()?.manoIzquierda?.[0]).toEqual([0.4, 0.4, 0]);
    });

    it('passes the real camera aspect ratio to the live avatar', () => {
      cuadro(0.1);
      expect(Reflect.get(service.fotogramaEnVivo()!, 'aspecto')).toBeCloseTo(4 / 3);
    });

    it('does not animate landmarks that are occluded or outside the camera', () => {
      puntos[25] = { x: 0.8, y: 0.9, z: 1, visibility: 0.1 };
      puntos[26] = { x: 0.5, y: 1.3, z: 1, visibility: 1 };
      cuadro(0.1);
      expect(service.fotogramaEnVivo()?.pose[25]).toBeNull();
      expect(service.fotogramaEnVivo()?.pose[26]).toBeNull();
      expect(service.fotogramaEnVivo()?.pose[27]).toEqual([0.5, 0.5, 0]);
    });

    it('reduces stationary jitter without freezing a deliberate movement', () => {
      cuadro(0.1);
      puntos = puntos.map((p) => ({ ...p, x: 0.502 }));
      cuadro(0.133);
      expect(Math.abs(service.fotogramaEnVivo()!.pose[11]![0] - 0.5)).toBeLessThan(0.001);
      puntos = puntos.map((p) => ({ ...p, x: 0.7 }));
      for (let i = 0; i < 10; i++) cuadro(0.166 + i / 30);
      expect(service.fotogramaEnVivo()!.pose[11]![0]).toBeGreaterThan(0.68);
    });

    it('does not shift anatomical indices when a coordinate is invalid', () => {
      puntos[11] = { x: NaN, y: 0.5, z: 0, visibility: 1 };
      puntos[12] = { x: 0.7, y: 0.4, z: 0, visibility: 1 };
      cuadro(0.1);
      expect(service.fotogramaEnVivo()?.pose[11]).toBeNull();
      expect(service.fotogramaEnVivo()?.pose[12]).toEqual([0.7, 0.4, 0]);
    });
  });
});
