import { Component, signal, ChangeDetectionStrategy, HostListener } from '@angular/core';
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

      <div class="nav-links" *ngIf="!auth.isSuperUser()">

        <!-- ── Feuille de temps ── -->
        <a class="nav-link" routerLink="/pointage" routerLinkActive="active" *ngIf="auth.hasPerm('pointage.view')">
          Feuille de temps
        </a>

          <!-- Dropdown Employés -->
          <div class="nav-dropdown" [class.is-open]="openMenu() === 'emp'" *ngIf="auth.hasPerm('employees.view')">
            <button class="nav-link dropdown-btn" (click)="toggleDrop('emp', $event)">
              Employés <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/employees/new"        routerLinkActive="active" *ngIf="auth.hasPerm('employees.create')" (click)="closeDrop()">
                <span class="di-icon">＋</span> Nouvel employé
              </a>
              <a class="dropdown-item" routerLink="/employees/validation" routerLinkActive="active" (click)="closeDrop()">
                <span class="di-icon">✅</span> Profil Employé
              </a>
              <a class="dropdown-item" routerLink="/employees/edit"       routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')" (click)="closeDrop()">
                <span class="di-icon">✎</span> Modifier employé
              </a>
              <a class="dropdown-item" routerLink="/employees" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeDrop()">
                <span class="di-icon">☰</span> Validation Pointage
              </a>
              <a class="dropdown-item" routerLink="/companies/assign"    routerLinkActive="active" *ngIf="auth.hasPerm('companies.edit')" (click)="closeDrop()">
                <span class="di-icon">⇄</span> Lier employés
              </a>
              <a class="dropdown-item" routerLink="/employees/pricing"    routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')" (click)="closeDrop()">
                <span class="di-icon">$</span> Tarifs employés
              </a>
            </div>
          </div>

          <!-- Dropdown Compagnies -->
          <div class="nav-dropdown" [class.is-open]="openMenu() === 'co'" *ngIf="auth.hasPerm('companies.view')">
            <button class="nav-link dropdown-btn" (click)="toggleDrop('co', $event)">
              Compagnies <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/companies/new"    routerLinkActive="active" *ngIf="auth.hasPerm('companies.edit')" (click)="closeDrop()">
                <span class="di-icon">＋</span> Nouvelle compagnie
              </a>
              <a class="dropdown-item" routerLink="/companies/edit"   routerLinkActive="active" *ngIf="auth.hasPerm('companies.edit')" (click)="closeDrop()">
                <span class="di-icon">✎</span> Modifier compagnie
              </a>
              <a class="dropdown-item" routerLink="/employees/assign"  routerLinkActive="active" *ngIf="auth.hasPerm('employees.edit')" (click)="closeDrop()">
                <span class="di-icon">⇄</span> Lier compagnies
              </a>
            </div>
          </div>

          <!-- Dropdown Factures -->
          <div class="nav-dropdown" [class.is-open]="openMenu() === 'inv'" *ngIf="auth.hasPerm('invoices.view')">
            <button class="nav-link dropdown-btn" (click)="toggleDrop('inv', $event)">
              Factures <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/invoices/new"             routerLinkActive="active" *ngIf="auth.hasPerm('invoices.edit')" (click)="closeDrop()">
                <span class="di-icon">＋</span> Nouvelle facture
              </a>
              <a class="dropdown-item" routerLink="/invoices/from-timesheets" routerLinkActive="active" *ngIf="auth.hasPerm('invoices.edit')" (click)="closeDrop()">
                <span class="di-icon">🕐</span> Facturer par pointages
              </a>
              <a class="dropdown-item" routerLink="/invoices/send" routerLinkActive="active" *ngIf="auth.hasPerm('invoices.send')" (click)="closeDrop()">
                <span class="di-icon">✉</span> Envoyer les factures
              </a>
              <a class="dropdown-item" routerLink="/invoices" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeDrop()">
                <span class="di-icon">☰</span> Gérer les factures
              </a>
              <a class="dropdown-item" routerLink="/stats" routerLinkActive="active" *ngIf="auth.hasPerm('invoices.view')" (click)="closeDrop()">
                <span class="di-icon">📊</span> Statistiques
              </a>
            </div>
          </div>

          <!-- Dropdown Gestion accès -->
          <div class="nav-dropdown" [class.is-open]="openMenu() === 'adm'" *ngIf="auth.hasPerm('groups.manage') || auth.hasPerm('employees.edit') || auth.hasPerm('config.manage')">
            <button class="nav-link dropdown-btn" (click)="toggleDrop('adm', $event)">
              Gestion accès <span class="dropdown-arrow">▾</span>
            </button>
            <div class="dropdown-panel">
              <a class="dropdown-item" routerLink="/groups"                routerLinkActive="active" *ngIf="auth.hasPerm('groups.manage')" (click)="closeDrop()">
                <span class="di-icon">🔐</span> Groupes
              </a>
              <a class="dropdown-item" routerLink="/employees/credentials" routerLinkActive="active" *ngIf="auth.hasPerm('credentials.manage')" (click)="closeDrop()">
                <span class="di-icon">🔑</span> Identifiants
              </a>
              <a class="dropdown-item" routerLink="/config"                routerLinkActive="active" *ngIf="auth.hasPerm('config.manage')" (click)="closeDrop()">
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

    <div class="mobile-menu" *ngIf="open() && !auth.isSuperUser()">

      <!-- Feuille de temps -->
      <a class="mobile-link" routerLink="/pointage" routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('pointage.view')">Feuille de temps</a>

        <ng-container *ngIf="auth.hasPerm('employees.view')">
          <div class="mobile-section-label">Employés</div>
          <a class="mobile-link mobile-sub" routerLink="/employees" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeMenu()">Validation Pointage</a>
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
          <a class="mobile-link mobile-sub" routerLink="/invoices/send"            routerLinkActive="active" (click)="closeMenu()" *ngIf="auth.hasPerm('invoices.send')">✉ Envoyer les factures</a>
          <a class="mobile-link mobile-sub" routerLink="/invoices" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="closeMenu()">Gérer les factures</a>
        </ng-container>
        <ng-container *ngIf="auth.hasPerm('groups.manage') || auth.hasPerm('credentials.manage') || auth.hasPerm('config.manage')">
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
  open     = signal(false);
  openMenu = signal<string | null>(null);

  constructor(public auth: AuthService, private router: Router) {}

  toggleMenu(): void { this.open.update(v => !v); }
  closeMenu():  void { this.open.set(false); }
  initials(): string { return (this.auth.user()?.username ?? '?').substring(0, 2).toUpperCase(); }
  logout():   void   { this.auth.logout(); this.router.navigate(['/login']); }

  toggleDrop(name: string, e: MouseEvent): void {
    e.stopPropagation();
    this.openMenu.update(v => v === name ? null : name);
  }

  closeDrop(): void { this.openMenu.set(null); }

  @HostListener('document:click')
  onDocClick(): void { this.openMenu.set(null); }
}
