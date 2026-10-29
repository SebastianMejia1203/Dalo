import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { By } from '@angular/platform-browser';
import { LucideAngularModule, Mic, Video, VideoOff, Volume2, VolumeX } from 'lucide-angular';

import { Comunicador } from './comunicador';
import { DaloService } from '../servicios/dalo';
import { SeguimientoService } from '../servicios/seguimiento';
import { ModeloReconocimientoService } from '../servicios/modelo-reconocimiento';
import { vi } from 'vitest';
import { AvatarLsc } from '../avatar-lsc/avatar-lsc';

describe('Comunicador', () => {
  let component: Comunicador;
  let fixture: ComponentFixture<Comunicador>;

  afterEach(() => vi.unstubAllGlobals());

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Comunicador],
      providers: [
        importProvidersFrom(LucideAngularModule.pick({ Mic, Video, VideoOff, Volume2, VolumeX })),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Comunicador);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it.each([
    ['Espera', 'esperar'],
    ['Espérame', 'esperar'],
    ['Un momento', 'esperar'],
    ['Lo siento', 'losiento'],
    ['Lo lamento', 'losiento'],
  ])('muestra una animación al buscar %s en Español a Señas', async (texto, id) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );
    const dalo = TestBed.inject(DaloService);
    dalo.cambiarDireccion('es-lsc');
    dalo.buscarEnLsc(texto);
    await fixture.whenStable();
    const avatar = fixture.nativeElement.querySelector('app-avatar-lsc');
    expect(avatar).not.toBeNull();
    const reproductor = fixture.debugElement.query(By.directive(AvatarLsc))
      .componentInstance as AvatarLsc;
    expect(reproductor.animacionUrl()).toBe(`avatar/${id}.vrma`);
    expect(fixture.nativeElement.textContent).not.toContain('Video aún no disponible');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it.each([
    ['gr', ['Gracias', 'Muchas gracias']],
    ['PERDÓN', ['Perdón']],
    ['lo lam', ['Lo siento']],
    ['Ayudar', ['Ayuda']],
    ['zzzz', []],
  ])('sugiere las coincidencias del catálogo mientras se escribe %s', async (texto, nombres) => {
    TestBed.inject(DaloService).cambiarDireccion('es-lsc');
    await fixture.whenStable();
    const campo = fixture.nativeElement.querySelector('#texto-es') as HTMLTextAreaElement;
    campo.value = texto;
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const sugerencias = Array.from(fixture.nativeElement.querySelectorAll('.chip')).map((element) =>
      (element as HTMLElement).textContent!.trim(),
    );
    expect(sugerencias).toEqual(nombres);
  });

  it('permite elegir una sugerencia y restaura los accesos iniciales al borrar', async () => {
    TestBed.inject(DaloService).cambiarDireccion('es-lsc');
    await fixture.whenStable();
    const campo = fixture.nativeElement.querySelector('#texto-es') as HTMLTextAreaElement;
    campo.value = 'gr';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    const botones = fixture.nativeElement.querySelectorAll(
      '.chip',
    ) as NodeListOf<HTMLButtonElement>;
    expect(botones).toHaveLength(2);
    botones[1].click();
    await fixture.whenStable();
    expect(campo.value).toBe('muchas gracias');
    expect(TestBed.inject(DaloService).resultadoEsl().id).toBe('muchasgracias');
    campo.value = '';
    campo.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.chip')).toHaveLength(3);
  });

  it('only adds a frame once when recognition state changes', async () => {
    const dalo = TestBed.inject(DaloService);
    const seguimiento = TestBed.inject(SeguimientoService);
    vi.spyOn(seguimiento, 'iniciarSeguimiento').mockResolvedValue();
    dalo.camara.set('activa');
    seguimiento.fotogramaEnVivo.set({
      pose: [],
      manoIzquierda: [[0.5, 0.5, 0]],
      manoDerecha: null,
    });
    await fixture.whenStable();
    expect(dalo.exportarVentanaAuto()).toHaveLength(1);
    dalo.faseLsc.set('ambigua');
    await fixture.whenStable();
    expect(dalo.exportarVentanaAuto()).toHaveLength(1);
  });

  it('shows a blocking recognition failure in the main guide, outside technical details', async () => {
    vi.spyOn(TestBed.inject(SeguimientoService), 'iniciarSeguimiento').mockResolvedValue();
    TestBed.inject(DaloService).camara.set('activa');
    TestBed.inject(DaloService).marcarModeloListo(false);
    TestBed.inject(ModeloReconocimientoService).errorCarga.set('No se pudo cargar el modelo');
    await fixture.whenStable();
    const guia = fixture.nativeElement.querySelector('.ayuda') as HTMLElement;
    expect(guia.textContent).toContain('no disponible');
    expect(guia.closest('details')).toBeNull();
  });
});
