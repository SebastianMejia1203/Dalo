import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { Check, ChevronDown, LucideAngularModule } from 'lucide-angular';

import { Desplegable } from './desplegable';

describe('Desplegable', () => {
  let component: Desplegable;
  let fixture: ComponentFixture<Desplegable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Desplegable],
      providers: [importProvidersFrom(LucideAngularModule.pick({ Check, ChevronDown }))],
    }).compileComponents();

    fixture = TestBed.createComponent(Desplegable);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('etiqueta', 'Cámara');
    fixture.componentRef.setInput('opciones', [
      { valor: '', texto: 'Automática' },
      { valor: 'cam1', texto: 'Cámara HD' },
    ]);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the selected option text', () => {
    fixture.componentRef.setInput('valor', 'cam1');
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.actual')?.textContent).toContain('Cámara HD');
  });

  it('emits the chosen value when an option is clicked', () => {
    const emitidos: string[] = [];
    component.cambio.subscribe((valor) => emitidos.push(valor));
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    (compiled.querySelector('.boton') as HTMLButtonElement).click();
    fixture.detectChanges();
    const opciones = compiled.querySelectorAll('.panel li');
    expect(opciones.length).toBe(2);
    (opciones[1] as HTMLLIElement).click();
    expect(emitidos).toEqual(['cam1']);
  });
});
