import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './vue/components/navbar/navbar.component';
import { NoteAlertComponent } from './vue/components/note-alert/note-alert.component';
import { AuthService } from './state/auth/auth.service';
import { ThemeService } from './state/theme/theme.service';

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, NavbarComponent, NoteAlertComponent, CommonModule, RouterLink],
    template: `
    <div class="staging-bar" *ngIf="isStaging" role="status">STAGING — environnement de test · données copiées de la prod · courriels redirigés</div>
    <app-navbar *ngIf="auth.loggedIn()"></app-navbar>
    <div class="super-bar" *ngIf="auth.isImpersonating()">
      <a class="super-back" routerLink="/providers" (click)="auth.restoreSession()">← Providers</a>
      <span class="super-tenant">{{ auth.user()?.tenantSlug }}</span>
      <span class="super-label">Mode aperçu</span>
    </div>
    <router-outlet></router-outlet>
    <app-note-alert *ngIf="auth.loggedIn()"></app-note-alert>
  `,
    styles: [`
    .staging-bar {
      background: #b45309; color: #fff; text-align: center;
      font-size: 12px; font-weight: 700; letter-spacing: .04em; padding: 4px 12px;
    }
    .super-bar {
      display: flex; align-items: center; gap: 14px;
      background: var(--surface); border-bottom: 1px solid rgba(var(--accent-rgb), .25);
      padding: 7px 20px; font-size: 12px;
    }
    .super-back {
      color: var(--accent); text-decoration: none; font-weight: 600; font-size: 12px;
      opacity: .85; transition: opacity .15s;
    }
    .super-back:hover { opacity: 1; text-decoration: underline; }
    .super-tenant {
      background: rgba(var(--accent-rgb), .12); border: 1px solid rgba(var(--accent-rgb), .3);
      color: var(--accent); padding: 2px 10px; border-radius: 20px;
      font-weight: 700; font-size: 11px; letter-spacing: .3px;
    }
    .super-label {
      font-size: 11px; color: rgba(var(--accent-rgb), .5); font-style: italic;
    }
  `]
})
export class AppComponent {
  /** Site de test (staging.timeguards.net) : bandeau permanent pour ne jamais le confondre avec la prod. */
  readonly isStaging = location.hostname.toLowerCase().startsWith('staging.');

  // ThemeService instancié dès le démarrage : le design de l'utilisateur s'applique aussi à la page de connexion
  constructor(public auth: AuthService, private theme: ThemeService) {}
}
