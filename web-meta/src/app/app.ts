import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Ajustes } from './ajustes/ajustes';
import { Comunicador } from './comunicador/comunicador';
import { Expresiones } from './expresiones/expresiones';
import { DaloService } from './servicios/dalo';
import { ModeloAvatarService } from './avatar-lsc/modelo-avatar';

@Component({
  selector: 'app-root',
  imports: [Ajustes, Comunicador, Expresiones, LucideAngularModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly dalo = inject(DaloService);
  private readonly modelosAvatar = inject(ModeloAvatarService);
  protected readonly claseTexto = computed(() => {
    const tamano = this.dalo.ajustes().tamanoTexto;
    if (tamano === 'grande') return 'texto-grande';
    if (tamano === 'muy-grande') return 'texto-muy-grande';
    return '';
  });

  constructor() {
    // Solo el personaje compartido se precarga tras el primer pintado.
    // Cada animación se descarga y cachea cuando se solicita su vista previa.
    if (typeof window !== 'undefined') {
      this.modelosAvatar.retenerCargaTrasPintado();
      this.modelosAvatar.precargar();
    }
  }
}
