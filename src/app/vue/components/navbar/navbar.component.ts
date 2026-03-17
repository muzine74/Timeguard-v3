import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="brand">
        <span class="dot"></span>
        <span>TimeGuard</span>
        <span class="brand-ver">v2.0</span>
      </div>

      <div class="nav-links">
        <a class="nav-link" routerLink="/employees" routerLinkActive="active">Employés</a>
        <a class="nav-link" routerLink="/pointage"  routerLinkActive="active">Pointage</a>
        <a class="nav-link" *ngIf="auth.isAdmin()">Rapports</a>
        <a class="nav-link" *ngIf="auth.isAdmin()">Paramètres</a>
      </div>

      <div class="nav-right">
        <span class="badge badge-online">● En ligne</span>
        <div class="avatar">{{ initials() }}</div>
        <span class="nav-username">{{ auth.user()?.username }}</span>
        <span class="badge badge-admin" *ngIf="auth.isAdmin()">ADMIN</span>
        <button class="btn-logout" (click)="auth.logout()">✕</button>
        <button class="hamburger" (click)="toggleMenu()">{{ open() ? '✕' : '☰' }}</button>
      </div>
    </nav>

    <div class="mobile-menu" *ngIf="open()">
      <a class="mobile-link" routerLink="/employees" routerLinkActive="active" (click)="closeMenu()">Employés</a>
      <a class="mobile-link" routerLink="/pointage"  routerLinkActive="active" (click)="closeMenu()">Pointage</a>
      <div class="mobile-footer">
        <span class="badge badge-admin" *ngIf="auth.isAdmin()">ADMIN</span>
        <button class="btn-logout-mob" (click)="auth.logout()">Déconnexion</button>
      </div>
    </div>
  `,
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  open = signal(false);

  constructor(public auth: AuthService) {}

  toggleMenu(): void { this.open.update(v => !v); }
  closeMenu():  void { this.open.set(false); }
  initials(): string { return (this.auth.user()?.username ?? '?').substring(0, 2).toUpperCase(); }
}