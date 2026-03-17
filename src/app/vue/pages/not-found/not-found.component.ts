import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="nf">
      <div class="nf-code">404</div>
      <h1 class="nf-title">Page introuvable</h1>
      <p class="nf-sub">La page demandée n'existe pas ou a été déplacée.</p>
      <a routerLink="/employees" class="btn-home">→ Retour à l'accueil</a>
    </div>
  `,
  styles: [`
    .nf {
      min-height: 80vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 12px;
      text-align: center; padding: 2rem; background: var(--bg);
    }
    .nf-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 7rem; font-weight: 700; letter-spacing: -4px; line-height: 1;
      color: var(--border);
    }
    .nf-title { font-size: 1.5rem; font-weight: 700; color: var(--text); }
    .nf-sub   { font-size: .875rem; color: var(--muted); max-width: 340px; }
    .btn-home {
      margin-top: 8px; padding: 10px 22px;
      background: rgba(201,162,39,.12); border: 1px solid rgba(201,162,39,.3);
      color: var(--accent); border-radius: 9px; font-size: 13px; font-weight: 700;
      &:hover { background: rgba(201,162,39,.22); }
    }
  `]
})
export class NotFoundComponent {}
