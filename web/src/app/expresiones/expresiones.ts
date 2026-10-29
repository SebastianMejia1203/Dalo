import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { NgOptimizedImage } from '@angular/common';
import { DALO_CATALOG, type Expresion } from '../catalog';
import { DaloService } from '../servicios/dalo';
import { AvatarLsc } from '../avatar-lsc/avatar-lsc';
import { normalizeSpanish } from '../adapters';

@Component({
  selector: 'app-expresiones',
  imports: [LucideAngularModule, AvatarLsc, NgOptimizedImage],
  templateUrl: './expresiones.html',
  styleUrl: './expresiones.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'cerrarVistaPrevia()' },
})
export class Expresiones {
  protected readonly dalo = inject(DaloService);
  private readonly porPagina = 8;
  protected readonly busqueda = signal('');
  protected readonly pagina = signal(0);
  private readonly filtradas = computed(() => {
    const termino = normalizeSpanish(this.busqueda());
    return DALO_CATALOG.filter((entrada) =>
      normalizeSpanish([entrada.nombre, ...entrada.formulaciones].join(' ')).includes(termino),
    );
  });
  protected readonly totalExpresiones = computed(() => this.filtradas().length);
  protected readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalExpresiones() / this.porPagina)),
  );
  // Las tarjetas son imágenes; un único reproductor se conserva y se mueve
  // sobre la miniatura activa, sin recrear el contexto WebGL entre tarjetas.
  protected readonly catalogo = computed(() =>
    this.filtradas().slice(this.pagina() * this.porPagina, (this.pagina() + 1) * this.porPagina),
  );
  readonly elegir = output<string>();
  protected readonly entradaVistaPrevia = signal<Expresion | null>(null);
  protected readonly entradaModal = signal<Expresion | null>(null);
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogoAnimacion');
  protected readonly vistaPreviaVisible = signal(false);
  protected readonly vistaPreviaLista = signal(false);
  protected readonly posicionVistaPrevia = signal({ izquierda: 0, arriba: 0, ancho: 0, alto: 0 });

  protected activarVistaPrevia(entrada: Expresion, evento: Event): void {
    if (this.entradaModal()) return;
    if (this.entradaVistaPrevia()?.id !== entrada.id) this.vistaPreviaLista.set(false);
    const miniatura = evento.currentTarget as HTMLElement;
    const contenedor = miniatura.closest('.contenedor-lista') as HTMLElement;
    const caja = miniatura.getBoundingClientRect();
    const origen = contenedor.getBoundingClientRect();
    this.posicionVistaPrevia.set({
      izquierda: caja.left - origen.left,
      arriba: caja.top - origen.top,
      ancho: caja.width,
      alto: caja.height,
    });
    this.entradaVistaPrevia.set(entrada);
    this.vistaPreviaVisible.set(true);
  }

  protected desactivarVistaPrevia(id: string, evento: Event): void {
    if (this.entradaVistaPrevia()?.id !== id) return;
    const miniatura = evento.currentTarget as HTMLElement;
    if (evento.type === 'mouseleave' && miniatura.contains(miniatura.ownerDocument.activeElement))
      return;
    if (evento.type === 'focusout' && miniatura.matches(':hover')) return;
    this.cerrarVistaPrevia();
  }

  protected cerrarVistaPrevia(): void {
    this.vistaPreviaVisible.set(false);
  }

  protected abrirModal(entrada: Expresion): void {
    this.cerrarVistaPrevia();
    // Se libera el reproductor pequeño antes de montar el grande: solo una
    // animación controla el modelo VRM compartido y utiliza WebGL a la vez.
    this.entradaVistaPrevia.set(null);
    this.vistaPreviaLista.set(false);
    this.entradaModal.set(entrada);
    this.dialogo().nativeElement.showModal();
  }

  protected cerrarModal(): void {
    this.dialogo().nativeElement.close();
  }

  protected alCerrarModal(): void {
    this.entradaModal.set(null);
  }

  protected alPulsarFondo(evento: MouseEvent): void {
    const dialogo = this.dialogo().nativeElement;
    if (evento.target !== dialogo) return;
    const caja = dialogo.getBoundingClientRect();
    if (
      evento.clientX < caja.left ||
      evento.clientX > caja.right ||
      evento.clientY < caja.top ||
      evento.clientY > caja.bottom
    )
      this.cerrarModal();
  }

  protected buscar(evento: Event): void {
    this.cerrarVistaPrevia();
    this.busqueda.set((evento.target as HTMLInputElement).value);
    this.pagina.set(0);
  }

  protected cambiarPagina(desplazamiento: number): void {
    this.cerrarVistaPrevia();
    this.pagina.update((actual) =>
      Math.max(0, Math.min(this.totalPaginas() - 1, actual + desplazamiento)),
    );
  }
}
