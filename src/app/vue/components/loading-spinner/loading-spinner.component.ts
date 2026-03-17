import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="spinner-wrap" [class.full]="fullPage">
      <div class="spin"></div>
      <p class="msg">{{ message }}</p>
    </div>
  `,
  styles: [`
    .spinner-wrap {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 12px; padding: 2rem;
    }
    .spinner-wrap.full { position: fixed; inset: 0; background: rgba(8,11,20,.7); z-index: 999; }
    .spin {
      width: 36px; height: 36px;
      border: 3px solid rgba(201,162,39,.2); border-top-color: var(--accent);
      border-radius: 50%; animation: spin .8s linear infinite;
    }
    .msg { font-size: 12px; color: var(--muted); }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class LoadingSpinnerComponent {
  @Input() message  = 'Chargement...';
  @Input() fullPage = false;
}
