import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export interface OpcionDesplegable {
  valor: string;
  texto: string;
}

@Component({
  selector: 'app-desplegable',
  imports: [LucideAngularModule],
  templateUrl: './desplegable.html',
  styleUrl: './desplegable.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'alClicExterno($event)',
    '(keydown.escape)': 'cerrar()',
  },
})
export class Desplegable {
  readonly etiqueta = input.required<string>();
  readonly opciones = input<OpcionDesplegable[]>([]);
  readonly valor = input('');
  readonly cambio = output<string>();

  protected readonly abierto = signal(false);
  protected readonly indiceActivo = signal(0);
  private readonly anfitrion = inject(ElementRef);

  protected readonly textoActual = computed(() => {
    const actual = this.opciones().find((opcion) => opcion.valor === this.valor());
    return actual ? actual.texto : 'Elegir';
  });

  protected alternar(): void {
    if (this.abierto()) {
      this.cerrar();
      return;
    }
    const actual = this.opciones().findIndex((opcion) => opcion.valor === this.valor());
    this.indiceActivo.set(Math.max(actual, 0));
    this.abierto.set(true);
  }

  protected cerrar(): void {
    this.abierto.set(false);
  }

  protected elegir(valor: string): void {
    this.cambio.emit(valor);
    this.cerrar();
  }

  protected alClicExterno(evento: Event): void {
    if (this.abierto() && !this.anfitrion.nativeElement.contains(evento.target)) this.cerrar();
  }

  protected alTeclado(evento: KeyboardEvent): void {
    const total = this.opciones().length;
    if (total === 0) return;
    if (!this.abierto()) {
      if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp' || evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        this.alternar();
      }
      return;
    }
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.indiceActivo.update((i) => (i + 1) % total);
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.indiceActivo.update((i) => (i - 1 + total) % total);
        break;
      case 'Home':
        evento.preventDefault();
        this.indiceActivo.set(0);
        break;
      case 'End':
        evento.preventDefault();
        this.indiceActivo.set(total - 1);
        break;
      case 'Enter':
      case ' ':
        evento.preventDefault();
        {
          const opcion = this.opciones()[this.indiceActivo()];
          if (opcion) this.elegir(opcion.valor);
        }
        break;
      case 'Tab':
        this.cerrar();
        break;
    }
  }
}
