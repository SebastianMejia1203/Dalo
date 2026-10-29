import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Desplegable } from '../desplegable/desplegable';
import { DaloService, TamanoTexto } from '../servicios/dalo';

@Component({
  selector: 'app-ajustes',
  imports: [Desplegable, LucideAngularModule],
  templateUrl: './ajustes.html',
  styleUrl: './ajustes.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Ajustes {
  protected readonly dalo = inject(DaloService);
  protected readonly camaras = signal<MediaDeviceInfo[]>([]);
  protected readonly microfonos = signal<MediaDeviceInfo[]>([]);
  protected readonly voces = signal<SpeechSynthesisVoice[]>([]);
  protected readonly mensajeVoz = signal('');
  protected readonly detectando = signal(false);
  protected readonly mensajeDeteccion = signal('');
  protected readonly opcionesCamaras = computed(() => [
    { valor: '', texto: 'Automática' },
    ...this.camaras().map((camara) => ({ valor: camara.deviceId, texto: camara.label || 'Cámara sin nombre' })),
  ]);
  protected readonly opcionesMicrofonos = computed(() => [
    { valor: '', texto: 'Automático' },
    ...this.microfonos().map((microfono) => ({ valor: microfono.deviceId, texto: microfono.label || 'Micrófono sin nombre' })),
  ]);
  protected readonly opcionesVoces = computed(() => [
    { valor: '', texto: 'Automática (mejor español disponible)' },
    ...this.vocesOrdenadas().map((voz) => ({ valor: voz.name, texto: `${voz.name} (${voz.lang})` })),
  ]);
  protected readonly vocesOrdenadas = computed(() => {
    const peso = (idioma: string) => {
      const codigo = idioma.toLowerCase();
      if (codigo.startsWith('es-co')) return 0;
      if (codigo.startsWith('es')) return 1;
      return 2;
    };
    return [...this.voces()].sort(
      (a, b) => peso(a.lang) - peso(b.lang) || a.name.localeCompare(b.name),
    );
  });

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const [camaras, microfonos] = await Promise.all([this.dalo.listarCamaras(), this.dalo.listarMicrofonos()]);
    this.camaras.set(camaras);
    this.microfonos.set(microfonos);
    this.voces.set(this.dalo.obtenerVoces());
    try {
      globalThis.speechSynthesis?.addEventListener(
        'voiceschanged',
        () => this.voces.set(this.dalo.obtenerVoces()),
        { once: true },
      );
    } catch {
      // Sin evento de voces, se conserva la primera lectura.
    }
  }

  protected elegirVelocidad(evento: Event): void {
    const campo = evento.target as HTMLInputElement | null;
    if (campo) this.dalo.guardarVelocidad(Number(campo.value));
  }

  protected elegirTamano(tamano: TamanoTexto): void {
    this.dalo.guardarTamanoTexto(tamano);
  }

  protected probarVoz(): void {
    this.mensajeVoz.set(this.dalo.hablar('Hola, esta es la voz de Daló.'));
  }

  protected async detectar(): Promise<void> {
    if (this.detectando()) return;
    this.detectando.set(true);
    this.mensajeDeteccion.set('');
    try {
      const resultado = await this.dalo.detectarDispositivos();
      this.camaras.set(resultado.camaras);
      this.microfonos.set(resultado.microfonos);
      this.mensajeDeteccion.set(resultado.mensaje);
    } finally {
      this.detectando.set(false);
    }
  }
}
