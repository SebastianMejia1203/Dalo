import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { DaloService } from './dalo';

describe('DaloService', () => {
  let service: DaloService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DaloService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('starts with camera off and light LSC->Spanish direction', () => {
    expect(service.camara()).toBe('apagada');
    expect(service.direccion()).toBe('lsc-es');
    expect(service.faseLsc()).toBe('reposo');
  });

  it('shows a clear match directly without confirmation', () => {
    service.buscarEnLsc('Hola');
    expect(service.resultadoEsl().estado).toBe('directa');
    expect(service.resultadoEsl().id).toBe('hola');
  });

  it('asks for clarification on ambiguous phrases', () => {
    service.buscarEnLsc('hola gracias');
    expect(service.resultadoEsl().estado).toBe('ambigua');
    expect(service.resultadoEsl().ids.length).toBeGreaterThan(1);
  });

  it('reports out-of-catalog expressions', () => {
    service.buscarEnLsc('el ornitorrinco nada al amanecer');
    expect(service.resultadoEsl().estado).toBe('fuera');
  });

  it('informs when the browser exposes no camera', async () => {
    await service.activarCamara();
    expect(service.camara()).toBe('no-disponible');
    expect(service.mensajeCamara()).toContain('cámara');
  });

  it('reports no devices when the browser exposes none', async () => {
    const resultado = await service.detectarDispositivos();
    expect(resultado.camaras).toEqual([]);
    expect(resultado.microfonos).toEqual([]);
    expect(resultado.mensaje.length).toBeGreaterThan(0);
  });

  it('prefers a Colombian Spanish voice when set to automatic', () => {
    const vocesFalsas = [
      { name: 'English', lang: 'en-US' },
      { name: 'Sabina', lang: 'es-CO' },
    ] as SpeechSynthesisVoice[];
    let mensaje: { voice?: SpeechSynthesisVoice | null } | undefined;
    class MensajeFalso {
      voice: SpeechSynthesisVoice | null = null;
      lang = '';
      rate = 1;
      constructor(public text: string) {}
    }
    Object.defineProperty(globalThis, 'speechSynthesis', {
      value: {
        getVoices: () => vocesFalsas,
        cancel: vi.fn(),
        speak: (m: { voice?: SpeechSynthesisVoice | null }) => {
          mensaje = m;
        },
      },
      configurable: true,
    });
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: MensajeFalso, configurable: true });
    try {
      service.guardarVoz('');
      expect(service.hablar('Hola')).toBe('');
      expect(mensaje?.voice).toBe(vocesFalsas[1]);
    } finally {
      delete (globalThis as unknown as Record<string, unknown>)['speechSynthesis'];
      delete (globalThis as unknown as Record<string, unknown>)['SpeechSynthesisUtterance'];
    }
  });

  it('detects real devices when permission is granted', async () => {
    const detener = vi.fn();
    const falsas = [
      { kind: 'videoinput', label: 'Cámara HD', deviceId: 'cam1' },
      { kind: 'audioinput', label: 'Micrófono USB', deviceId: 'mic1' },
    ];
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: detener }] }),
        enumerateDevices: vi.fn().mockResolvedValue(falsas),
      },
      configurable: true,
    });
    try {
      const resultado = await service.detectarDispositivos();
      expect(resultado.camaras.map((d) => d.label)).toEqual(['Cámara HD']);
      expect(resultado.microfonos.map((d) => d.label)).toEqual(['Micrófono USB']);
      expect(resultado.mensaje).toContain('1 cámara');
      expect(resultado.mensaje).toContain('1 micrófono');
      expect(detener).toHaveBeenCalled();
      expect(service.ajustes().camaraId).toBe('cam1');
      expect(service.ajustes().microfonoId).toBe('mic1');
    } finally {
      delete (globalThis.navigator as unknown as Record<string, unknown>)['mediaDevices'];
    }
  });

  it('reports clearly when permission is denied', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
    });
    try {
      const resultado = await service.detectarDispositivos();
      expect(resultado.camaras).toEqual([]);
      expect(resultado.mensaje).toContain('permiso');
    } finally {
      delete (globalThis.navigator as unknown as Record<string, unknown>)['mediaDevices'];
    }
  });

  it('records a real-tracking turn without assigning words', () => {
    vi.useFakeTimers();
    try {
      service.camara.set('activa');
      service.iniciarGrabacion();
      expect(service.faseLsc()).toBe('grabando');
      vi.advanceTimersByTime(3000);
      service.finalizarGrabacion();
      // Sin simulación de reconocimiento: vuelve a reposo y no propone candidata.
      expect(service.faseLsc()).toBe('reposo');
      expect(service.candidataId()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps short captures in reposo instead of inventing a word', () => {
    vi.useFakeTimers();
    try {
      service.camara.set('activa');
      service.iniciarGrabacion();
      vi.advanceTimersByTime(500);
      service.finalizarGrabacion();
      expect(service.faseLsc()).toBe('reposo');
      expect(service.candidataId()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels the capture and returns to reposo', () => {
    vi.useFakeTimers();
    try {
      service.camara.set('activa');
      service.iniciarGrabacion();
      vi.advanceTimersByTime(8000);
      service.cancelarGrabacion();
      expect(service.faseLsc()).toBe('reposo');
      expect(service.candidataId()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
