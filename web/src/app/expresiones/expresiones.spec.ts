import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { LucideAngularModule, VideoOff } from 'lucide-angular';

import { Expresiones } from './expresiones';

describe('Expresiones', () => {
  let component: Expresiones;
  let fixture: ComponentFixture<Expresiones>;

  afterEach(() => {
    vi.unstubAllGlobals();
  });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Expresiones],
      providers: [importProvidersFrom(LucideAngularModule.pick({ VideoOff }))],
    }).compileComponents();

    fixture = TestBed.createComponent(Expresiones);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('filtra todo el catálogo sin distinguir tildes y vuelve a la primera página', async () => {
    const siguiente = fixture.nativeElement.querySelector(
      '[aria-label="Página siguiente"]',
    ) as HTMLButtonElement;
    siguiente.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const campo = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    expect(campo).not.toBeNull();
    campo.value = 'DIAS';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.item')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.datos strong').textContent).toBe('Buenos días');
    expect(
      (fixture.nativeElement.querySelector('[aria-label="Página anterior"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('muestra un estado vacío y recupera el catálogo al limpiar la búsqueda', async () => {
    const campo = fixture.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    expect(campo).not.toBeNull();
    campo.value = 'expresión inexistente';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.item')).toHaveLength(0);
    expect(fixture.nativeElement.textContent).toContain('No se encontraron expresiones');
    campo.value = '';
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.item')).toHaveLength(8);
    expect(fixture.nativeElement.querySelector('.datos strong').textContent).toBe('Hola');
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('muestra ocho tarjetas por página para limitar los contextos 3D', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const textos = Array.from(fixture.nativeElement.querySelectorAll('.disp')).map((el) =>
      (el as HTMLElement).textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(textos).toHaveLength(8);
    expect(textos.filter((t) => t?.includes('Cámara: Sí'))).toHaveLength(6);
    expect(textos.filter((t) => t?.includes('Avatar: Sí'))).toHaveLength(8);
  });

  it('abre con ocho miniaturas y sin montar reproductores 3D', () => {
    expect(fixture.nativeElement.querySelectorAll('.miniatura-avatar img')).toHaveLength(8);
    expect(fixture.nativeElement.querySelectorAll('app-avatar-lsc')).toHaveLength(0);
  });

  it('abre la seña pulsada en un diálogo y libera su reproductor al cerrar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );
    const dialogo = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    expect(dialogo).not.toBeNull();
    // JSDOM no implementa el diálogo nativo. Foco/Escape se prueban en Chromium.
    dialogo.showModal = () => { dialogo.open = true; };
    dialogo.close = () => {
      dialogo.open = false;
      dialogo.dispatchEvent(new Event('close'));
    };
    const miniatura = fixture.nativeElement.querySelector('.miniatura-avatar') as HTMLElement;
    miniatura.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialogo.open).toBe(true);
    expect(dialogo.querySelector('h2')?.textContent).toContain('Hola');
    expect(dialogo.querySelector('app-avatar-lsc')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.reproductor-compartido')).toBeNull();
    (dialogo.querySelector('[aria-label="Cerrar animación"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(dialogo.open).toBe(false);
    expect(dialogo.querySelector('app-avatar-lsc')).toBeNull();
  });

  it('reutiliza un único reproductor al pasar por distintas miniaturas y lo pausa al salir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );
    const miniaturas = fixture.nativeElement.querySelectorAll(
      '.miniatura-avatar',
    ) as NodeListOf<HTMLElement>;
    miniaturas[0].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    await fixture.whenStable();
    const reproductor = fixture.nativeElement.querySelector('app-avatar-lsc');
    expect(reproductor).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.reproductor-compartido').hidden).toBe(false);
    miniaturas[0].dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.reproductor-compartido').hidden).toBe(true);
    miniaturas[1].dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('app-avatar-lsc')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('app-avatar-lsc')).toBe(reproductor);
  });

  it('activa la miniatura con teclado y oculta el reproductor al cambiar de página', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('sin red');
      }),
    );
    const miniatura = fixture.nativeElement.querySelector('.miniatura-avatar') as HTMLElement;
    miniatura.dispatchEvent(new FocusEvent('focusin'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.reproductor-compartido').hidden).toBe(false);
    (
      fixture.nativeElement.querySelector('[aria-label="Página siguiente"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.reproductor-compartido').hidden).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('.miniatura-avatar img')).toHaveLength(8);
  });

  it('permite recorrer las 33 expresiones, volver atrás y respetar los límites', async () => {
    const nombres: string[] = [];
    let reconocibles = 0;
    for (let pagina = 0; pagina < 5; pagina++) {
      fixture.detectChanges();
      await fixture.whenStable();
      nombres.push(
        ...Array.from(fixture.nativeElement.querySelectorAll('.datos strong')).map((element) =>
          (element as HTMLElement).textContent!.trim(),
        ),
      );
      reconocibles += Array.from(fixture.nativeElement.querySelectorAll('.disp')).filter(
        (element) => (element as HTMLElement).textContent?.includes('Cámara: Sí'),
      ).length;
      const siguiente = fixture.nativeElement.querySelector(
        '[aria-label="Página siguiente"]',
      ) as HTMLButtonElement;
      expect(siguiente.disabled).toBe(pagina === 4);
      if (pagina < 4) siguiente.click();
    }
    expect(new Set(nombres).size).toBe(33);
    expect(nombres).toContain('Sí');
    expect(nombres).toContain('Lo siento');
    expect(reconocibles).toBe(8);
    for (let i = 0; i < 4; i++) {
      (
        fixture.nativeElement.querySelector('[aria-label="Página anterior"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      await fixture.whenStable();
    }
    expect(
      (fixture.nativeElement.querySelector('[aria-label="Página anterior"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(fixture.nativeElement.querySelector('.datos strong').textContent).toBe('Hola');
  });
});
