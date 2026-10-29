import { TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import {
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  LucideAngularModule,
  MessageCircle,
  Mic,
  Play,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Type,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from 'lucide-angular';
import { App } from './app';
import { ModeloAvatarService } from './avatar-lsc/modelo-avatar';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        importProvidersFrom(
          LucideAngularModule.pick({
            BookOpen,
            Camera,
            Check,
            ChevronDown,
            MessageCircle,
            Mic,
            Play,
            RefreshCw,
            ShieldCheck,
            SlidersHorizontal,
            Type,
            Video,
            VideoOff,
            Volume2,
            VolumeX,
          }),
        ),
      ],
    }).compileComponents();
  });

  it('precarga el modelo compartido sin descargar las animaciones del catálogo', async () => {
    const servicio = TestBed.inject(ModeloAvatarService);
    vi.spyOn(servicio, 'obtenerModelo').mockRejectedValue(new Error('sin red en prueba'));
    const animaciones = vi
      .spyOn(servicio, 'obtenerAnimacion')
      .mockRejectedValue(new Error('sin red en prueba'));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(animaciones).not.toHaveBeenCalled();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render header with Expresiones and Ajustes', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.marca')?.textContent).toContain('Daló.');
    expect(compiled.querySelector('#nav-expresiones')).toBeTruthy();
    expect(compiled.querySelector('#nav-ajustes')).toBeTruthy();
    expect(compiled.querySelector('#tab-lsc-es')).toBeTruthy();
    expect(compiled.querySelector('#tab-es-lsc')).toBeTruthy();
  });
});
