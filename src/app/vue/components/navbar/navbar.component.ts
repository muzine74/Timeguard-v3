import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
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

        <!-- ── Feuille de temps ── -->
        <a class="nav-link" routerLink="/pointage" routerLinkActive="active" *ngIf="auth.hasPerm('pointage.view')">
          Feuille de temps
        </a>

          <!-- Dropdown Employés -->
          <div class="nav-dropdown" *ngIf="auth.hasPerm('employees.view')">
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
              <a class="dropdown-item" routerLink="/employees/new"        routerLinkActive="active" *ngIf="auth.hasPerm('employees.create')">
                <span class="di-icon">＋</span> Nouvel employé
              </a>
              <a class="dropdown-item" routerLink="/employees/edit"       routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')">
                <span class="di-icon">✎</span> Modifier employé
              </a>
              <a class="dropdown-item" routerLink="/companies/assign"    routerLinkActive="active" *ngIf="auth.hasPerm('companies.edit')">
                <span class="di-icon">⇄</span> Lier employés
              </a>
              <a class="dropdown-item" routerLink="/employees/pricing"    routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')">
                <span class="di-icon">$</span> Tarifs employés
              </a>
            </div>
          </div>

          <!-- Dropdown Compagnies -->
          <div class="nav-dropdown" *ngIf="auth.hasPerm('companies.view')">
            <button class="nav-link dropdown-btn">
              Compagnies <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/employees/assign"  routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')">
                <span class="di-icon">⇄</span> Lier compagnies
              </a>
              <a class="dropdown-item" routerLink="/companies/new"    routerLinkActive="active" *ngIf="auth.hasPerm('companies.edit')">
                <span class="di-icon">＋</span> Nouvelle compagnie
              </a>
              <a class="dropdown-item" routerLink="/companies/edit"   routerLinkActive="active" *ngIf="auth.hasPerm('companies.edit')">
                <span class="di-icon">✎</span> Modifier compagnie
              </a>
            </div>
          </div>

          <!-- Dropdown Factures -->
          <div class="nav-dropdown" *ngIf="auth.hasPerm('invoices.view')">
            <button class="nav-link dropdown-btn">
              Factures <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/invoices/new"             routerLinkActive="active" *ngIf="auth.hasPerm('invoices.edit')">
                <span class="di-icon">＋</span> Nouvelle facture
              </a>
              <a class="dropdown-item" routerLink="/invoices/from-timesheets" routerLinkActive="active" *ngIf="auth.hasPerm('invoices.edit')">
                <span class="di-icon">🕐</span> Facturer par pointages
              </a>
              <a class="dropdown-item" routerLink="/invoices" routerLinkActive="active">
                <span class="di-icon">☰</span> Gérer les factures
              </a>
            </div>
          </div>

          <!-- Dropdown Gestion accès -->
          <div class="nav-dropdown" *ngIf="auth.hasPerm('groups.manage') || auth.hasPerm('employees.edit') || auth.hasPerm('config.manage')">
            <button class="nav-link dropdown-btn">
              Gestion accès <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/groups"                routerLinkActive="active" *ngIf="auth.hasPerm('groups.manage')">
                <span class="di-icon">🔐</span> Groupes
              </a>
              <a class="dropdown-item" routerLink="/employees/credentials" routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')">
                <span class="di-icon">🔑</span> Identifiants
              </a>
              <a class="dropdown-item" routerLink="/config"                routerLinkActive="active" *ngIf="auth.hasPerm('config.manage')">
                <span class="di-icon">⚙</span> Configuration
              </a>
            </div>
          </div>

      </div>

      <div class="nav-right">
        <span class="badge badge-online">● En ligne</span>
        <div class="avatar">{{ initials() }}</div>
        <span class="nav-username">{{ auth.user()?.username }}</span>
        <span class="badge badge-admin" *ngIf="auth.canManage()">ADMIN</span>
        <button class="btn-logout" (click)="logout()">✕</button>
        <button class="hamburger" (click)="toggleMenu()">{{ open() ? '✕' : '☰' }}</button>
      </div>
    </nav>

    <div class="mobile-menu" *ngIf="open()">

      <!-- Feuille de temps -->
      <a class="mobile-link" routerLink="/pointage" routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('pointage.view')">Feuille de temps</a>

        <ng-container *ngIf="auth.hasPerm('employees.view')">
          <div class="mobile-section-label">Employés</div>
          <a class="mobile-link mobile-sub" routerLink="/employees"             routerLinkActive="active" (click)="closeMenu()">Validation Pointage</a>
          <a class="mobile-link mobile-sub" routerLink="/employees/validation"  routerLinkActive="active" (click)="closeMenu()">Profil Employé</a>
          <a class="mobile-link mobile-sub" routerLink="/employees/new"         routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('employees.create')">Nouvel employé</a>
          <a class="mobile-link mobile-sub" routerLink="/employees/edit"        routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('employees.edit')">Modifier employé</a>
          <a class="mobile-link mobile-sub" routerLink="/companies/assign"     routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('companies.edit')">Lier employés</a>
          <a class="mobile-link mobile-sub" routerLink="/employees/pricing"     routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('employees.edit')">Tarifs employés</a>
        </ng-container>
        <ng-container *ngIf="auth.hasPerm('companies.view')">
          <div class="mobile-section-label">Compagnies</div>
          <a class="mobile-link mobile-sub" routerLink="/employees/assign" routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('employees.edit')">Lier compagnies</a>
          <a class="mobile-link mobile-sub" routerLink="/companies/new"    routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('companies.edit')">Nouvelle compagnie</a>
          <a class="mobile-link mobile-sub" routerLink="/companies/edit"   routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('companies.edit')">Modifier compagnie</a>
        </ng-container>
        <ng-container *ngIf="auth.hasPerm('invoices.view')">
          <div class="mobile-section-label">Factures</div>
          <a class="mobile-link mobile-sub" routerLink="/invoices/new"             routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('invoices.edit')">Nouvelle facture</a>
          <a class="mobile-link mobile-sub" routerLink="/invoices/from-timesheets" routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('invoices.edit')">Facturer par pointages</a>
          <a class="mobile-link mobile-sub" routerLink="/invoices"                 routerLinkActive="active" (click)="closeMenu()">Gérer les factures</a>
        </ng-container>
        <ng-container *ngIf="auth.hasPerm('groups.manage') || auth.hasPerm('employees.edit') || auth.hasPerm('config.manage')">
          <div class="mobile-section-label">Gestion accès</div>
          <a class="mobile-link mobile-sub" routerLink="/groups"                routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('groups.manage')">🔐 Groupes</a>
          <a class="mobile-link mobile-sub" routerLink="/employees/credentials" routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('employees.edit')">🔑 Identifiants</a>
          <a class="mobile-link mobile-sub" routerLink="/config"                routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('config.manage')">⚙ Configuration</a>
        </ng-container>

      <div class="mobile-footer">
        <span class="badge badge-admin" *ngIf="auth.canManage()">ADMIN</span>
        <button class="btn-logout-mob" (click)="logout()">Déconnexion</button>
      </div>
    </div>
  `,
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  open = signal(false);

  constructor(public auth: AuthService, private router: Router) {}

  toggleMenu(): void { this.open.update(v => !v); }
  closeMenu():  void { this.open.set(false); }
  initials(): string { return (this.auth.user()?.username ?? '?').substring(0, 2).toUpperCase(); }

  logout(): void { this.auth.logout(); this.router.navigate(['/login']); }
}
