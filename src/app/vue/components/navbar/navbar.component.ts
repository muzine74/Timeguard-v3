import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <nav class="navbar">
      <div class="brand">
        <span class="dot"></span>
        <span>TimeGuard</span>
        <span class="brand-ver">v2.0</span>
      </div>

      <div class="nav-links">

        <!-- ── USER : feuille de temps uniquement ── -->
        <ng-container *ngIf="auth.isUser()">
          <a class="nav-link" routerLink="/pointage" routerLinkActive="active">
            Feuille de temps
          </a>
        </ng-container>

        <!-- ── ADMIN : tout sauf feuille de temps ── -->
        <ng-container *ngIf="auth.isAdmin()">

          <!-- Dropdown Employés -->
          <div class="nav-dropdown">
            <button class="nav-link dropdown-btn">
              Employés <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/employees"            routerLinkActive="active">
                <span class="di-icon">☰</span> Validation Pointage
              </a>
              <a class="dropdown-item" routerLink="/employees/validation" routerLinkActive="active">
                <span class="di-icon">✅</span> Profil Employé
              </a>
              <a class="dropdown-item" routerLink="/employees/new"        routerLinkActive="active">
                <span class="di-icon">＋</span> Nouvel employé
              </a>
              <a class="dropdown-item" routerLink="/employees/edit"       routerLinkActive="active">
                <span class="di-icon">✎</span> Modifier employé
              </a>
              <a class="dropdown-item" routerLink="/employees/assign"     routerLinkActive="active">
                <span class="di-icon">⇄</span> Assigner à une compagnie
              </a>
            </div>
          </div>

          <!-- Dropdown Compagnies -->
          <div class="nav-dropdown">
            <button class="nav-link dropdown-btn">
              Compagnies <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/companies/new"    routerLinkActive="active">
                <span class="di-icon">＋</span> Nouvelle compagnie
              </a>
              <a class="dropdown-item" routerLink="/companies/edit"   routerLinkActive="active">
                <span class="di-icon">✎</span> Modifier compagnie
              </a>
              <a class="dropdown-item" routerLink="/companies/assign" routerLinkActive="active">
                <span class="di-icon">⇄</span> Assigner compagnies
              </a>
            </div>
          </div>

          <!-- Dropdown Factures -->
          <div class="nav-dropdown">
            <button class="nav-link dropdown-btn">
              Factures <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/invoices/new"             routerLinkActive="active">
                <span class="di-icon">＋</span> Nouvelle facture
              </a>
              <a class="dropdown-item" routerLink="/invoices/from-timesheets" routerLinkActive="active">
                <span class="di-icon">🕐</span> Facturer par pointages
              </a>
              <a class="dropdown-item" routerLink="/invoices"                 routerLinkActive="active">
                <span class="di-icon">☰</span> Gérer les factures
              </a>
            </div>
          </div>

        </ng-container>
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

      <!-- USER -->
      <ng-container *ngIf="auth.isUser()">
        <a class="mobile-link" routerLink="/pointage" routerLinkActive="active" (click)="closeMenu()">Feuille de temps</a>
      </ng-container>

      <!-- ADMIN -->
      <ng-container *ngIf="auth.isAdmin()">
        <div class="mobile-section-label">Employés</div>
        <a class="mobile-link mobile-sub" routerLink="/employees"            routerLinkActive="active" (click)="closeMenu()">Validation Pointage</a>
        <a class="mobile-link mobile-sub" routerLink="/employees/validation" routerLinkActive="active" (click)="closeMenu()">Profil Employé</a>
        <a class="mobile-link mobile-sub" routerLink="/employees/new"        routerLinkActive="active" (click)="closeMenu()">Nouvel employé</a>
        <a class="mobile-link mobile-sub" routerLink="/employees/edit"       routerLinkActive="active" (click)="closeMenu()">Modifier employé</a>
        <a class="mobile-link mobile-sub" routerLink="/employees/assign"     routerLinkActive="active" (click)="closeMenu()">Assigner à une compagnie</a>
        <div class="mobile-section-label">Compagnies</div>
        <a class="mobile-link mobile-sub" routerLink="/companies/new"    routerLinkActive="active" (click)="closeMenu()">Nouvelle compagnie</a>
        <a class="mobile-link mobile-sub" routerLink="/companies/edit"   routerLinkActive="active" (click)="closeMenu()">Modifier compagnie</a>
        <a class="mobile-link mobile-sub" routerLink="/companies/assign" routerLinkActive="active" (click)="closeMenu()">Assigner compagnies</a>
        <div class="mobile-section-label">Factures</div>
        <a class="mobile-link mobile-sub" routerLink="/invoices/new"             routerLinkActive="active" (click)="closeMenu()">Nouvelle facture</a>
        <a class="mobile-link mobile-sub" routerLink="/invoices/from-timesheets" routerLinkActive="active" (click)="closeMenu()">Facturer par pointages</a>
        <a class="mobile-link mobile-sub" routerLink="/invoices"                 routerLinkActive="active" (click)="closeMenu()">Gérer les factures</a>
      </ng-container>

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
