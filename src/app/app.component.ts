import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './vue/components/navbar/navbar.component';
import { AuthService } from './state/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, CommonModule, RouterLink],
  template: `
    <app-navbar *ngIf="auth.loggedIn()"></app-navbar>
    <div class="super-bar" *ngIf="auth.isImpersonating()">
      <a class="super-back" routerLink="/providers" (click)="auth.restoreSession()">← Providers</a>
      <span class="super-tenant">{{ auth.user()?.tenantSlug }}</span>
      <span class="super-label">Mode aperçu</span>
    </div>
    <router-outlet></router-outlet>
  `,
  styles: [`
    .super-bar {
      display: flex; align-items: center; gap: 14px;
      background: #12121f; border-bottom: 1px solid rgba(201,162,39,.25);
      padding: 7px 20px; font-size: 12px;
    }
    .super-back {
      color: #c9a227; text-decoration: none; font-weight: 600; font-size: 12px;
      opacity: .85; transition: opacity .15s;
    }
    .super-back:hover { opacity: 1; text-decoration: underline; }
    .super-tenant {
      background: rgba(201,162,39,.12); border: 1px solid rgba(201,162,39,.3);
      color: #c9a227; padding: 2px 10px; border-radius: 20px;
      font-weight: 700; font-size: 11px; letter-spacing: .3px;
    }
    .super-label {
      font-size: 11px; color: rgba(201,162,39,.5); font-style: italic;
    }
  `]
})
export class AppComponent {
  constructor(public auth: AuthService) {}
}
