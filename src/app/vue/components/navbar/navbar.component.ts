import { Component, signal, computed, ChangeDetectionStrategy, HostListener, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { ConfigService } from '../../../state/config/config.service';
import { TeamService } from '../../../state/team/team.service';
import { ThemeService } from '../../../state/theme/theme.service';

interface NavItem    { label: string; icon: string; link: string; exact?: boolean; show: () => boolean; }
interface NavSection { title?: string; items: NavItem[]; }
interface NavMenu    { id: string; label: string; sections: NavSection[]; }

@Component({
    selector: 'app-navbar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, RouterLink, RouterLinkActive],
    template: `
    <nav class="navbar">
      <div class="brand">
        <span class="dot"></span>
        <span>TimeGuard</span>
        <span class="brand-ver" *ngIf="config.appVersion() as ver" title="Version de l'application">v{{ ver }}</span>
      </div>

      <div class="nav-links" *ngIf="!auth.isSuperUser()">

        <!-- Menus par rôle (Mon travail · Gestion · Finances · Administration) — voir NAV_MENUS -->
        <div class="nav-dropdown" *ngFor="let m of menus(); trackBy: trackMenu" [class.is-open]="openMenu() === m.id">
          <button class="nav-link dropdown-btn" type="button" (click)="toggleDrop(m.id, $event)"
                  aria-haspopup="true" [attr.aria-expanded]="openMenu() === m.id">
            {{ m.label }} <span class="dropdown-arrow" aria-hidden="true">▾</span>
          </button>
          <div class="dropdown-panel">
            <ng-container *ngFor="let sec of m.sections">
              <div class="dropdown-section" *ngIf="sec.title">{{ sec.title }}</div>
              <a *ngFor="let it of sec.items" class="dropdown-item" [routerLink]="it.link" routerLinkActive="active"
                 [routerLinkActiveOptions]="{ exact: !!it.exact }" (click)="closeDrop()">
                <span class="di-icon" aria-hidden="true">{{ it.icon }}</span> {{ it.label }}
              </a>
            </ng-container>
          </div>
        </div>
      </div>

      <div class="nav-right">
        <!-- Aide (guide utilisateur, accessible à tous) -->
        <a class="nav-link help-link" routerLink="/aide" routerLinkActive="active">
          <span aria-hidden="true">❓</span><span class="help-txt">Aide</span>
        </a>

        <!-- Menu utilisateur : identité, statut, design de couleurs, déconnexion -->
        <div class="nav-dropdown user-dd" [class.is-open]="openMenu() === 'user'">
          <button type="button" class="user-btn" (click)="toggleDrop('user', $event)"
                  aria-haspopup="true" [attr.aria-expanded]="openMenu() === 'user'"
                  [attr.aria-label]="'Mon compte — ' + (auth.user()?.username ?? '')">
            <span class="avatar">{{ initials() }}<span class="online-dot" title="En ligne" aria-hidden="true"></span></span>
            <span class="nav-username">{{ auth.user()?.username }}</span>
            <span class="badge badge-admin" *ngIf="auth.canManage()">ADMIN</span>
            <span class="dropdown-arrow" aria-hidden="true">▾</span>
          </button>
          <div class="dropdown-panel user-panel" (click)="$event.stopPropagation()">
            <div class="user-head">
              <span class="avatar avatar-lg" aria-hidden="true">{{ initials() }}</span>
              <div class="user-meta">
                <b>{{ auth.user()?.username }}</b>
                <span class="user-badges">
                  <span class="badge badge-online">● En ligne</span>
                  <span class="badge badge-admin" *ngIf="auth.canManage()">ADMIN</span>
                </span>
              </div>
            </div>

            <div class="dropdown-section">Design de couleurs</div>
            <div class="theme-picker" role="radiogroup" aria-label="Design de couleurs">
              <ng-container *ngFor="let g of theme.groups">
                <div class="theme-group" aria-hidden="true">{{ g.label }}</div>
                <div class="theme-grid">
                  <button *ngFor="let t of g.themes" type="button" role="radio" class="theme-tile"
                          [attr.aria-checked]="theme.current() === t.id" [class.active]="theme.current() === t.id"
                          [attr.aria-label]="t.label + ' — ' + t.hint" [title]="t.hint" (click)="theme.choose(t.id)">
                    <span class="theme-swatch" aria-hidden="true"><i [style.background]="t.swatch[0]"></i><i [style.background]="t.swatch[1]"></i><i [style.background]="t.swatch[2]"></i></span>
                    <span class="theme-name">{{ t.label }}</span>
                  </button>
                </div>
              </ng-container>
            </div>

            <button type="button" class="user-logout" (click)="logout()"><span aria-hidden="true">⎋</span> Se déconnecter</button>
          </div>
        </div>
        <button class="hamburger" type="button" (click)="toggleMenu()" [attr.aria-expanded]="open()" aria-label="Menu">{{ open() ? '✕' : '☰' }}</button>
      </div>
    </nav>

    <div class="mobile-menu" *ngIf="open() && !auth.isSuperUser()">

      <ng-container *ngFor="let m of menus(); trackBy: trackMenu">
        <div class="mobile-section-label">{{ m.label }}</div>
        <ng-container *ngFor="let sec of m.sections">
          <div class="mobile-subsection" *ngIf="sec.title">{{ sec.title }}</div>
          <a *ngFor="let it of sec.items" class="mobile-link mobile-sub" [routerLink]="it.link" routerLinkActive="active"
             [routerLinkActiveOptions]="{ exact: !!it.exact }" (click)="closeMenu()">
            <span aria-hidden="true">{{ it.icon }}</span> {{ it.label }}
          </a>
        </ng-container>
      </ng-container>
      <a class="mobile-link" routerLink="/aide" routerLinkActive="active" (click)="closeMenu()">❓ Aide</a>
      <div class="mobile-section-label">Design de couleurs</div>
      <div class="mobile-themes" role="radiogroup" aria-label="Design de couleurs">
        <ng-container *ngFor="let g of theme.groups">
          <div class="theme-group" aria-hidden="true">{{ g.label }}</div>
          <button *ngFor="let t of g.themes" type="button" role="radio" class="mobile-link mobile-sub theme-opt"
                  [attr.aria-checked]="theme.current() === t.id" [class.active]="theme.current() === t.id" (click)="theme.choose(t.id)">
            <span class="theme-swatch" aria-hidden="true"><i [style.background]="t.swatch[0]"></i><i [style.background]="t.swatch[1]"></i><i [style.background]="t.swatch[2]"></i></span>
            {{ t.label }} <small>· {{ t.hint }}</small>
          </button>
        </ng-container>
      </div>

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

  /**
   * Navigation PAR RÔLE — source unique pour la barre (ordinateur) et le menu mobile.
   * Chaque entrée garde le droit d'accès de sa page ; un intertitre ou un menu sans entrée visible est masqué.
   */
  private readonly NAV_MENUS: NavMenu[] = [
    { id: 'work', label: 'Mon travail', sections: [{ items: [
      { label: 'Feuille de temps', icon: '🕐', link: '/pointage', show: () => this.has('pointage.view') },
      { label: 'Équipe',           icon: '👥', link: '/team',     show: () => this.team.hasTeam() || this.has('employees.view') },
      { label: 'Notes',            icon: '📝', link: '/notes',    show: () => true },
    ] }] },
    { id: 'manage', label: 'Gestion', sections: [
      { title: 'Personnel', items: [
        { label: 'Nouvel employé',     icon: '＋', link: '/employees/new',        show: () => this.has('employees.create') },
        { label: 'Modifier employé',   icon: '✎',  link: '/employees/edit',       show: () => this.has('employees.edit') },
        { label: 'Tarifs employés',    icon: '$',  link: '/employees/pricing',    show: () => this.has('employees.edit') },
      ] },
      { title: 'Clients', items: [
        { label: 'Liste compagnies',   icon: '☰',  link: '/companies/edit',       show: () => this.has('companies.edit') },
        { label: 'Nouvelle compagnie', icon: '＋', link: '/companies/new',        show: () => this.has('companies.edit') },
      ] },
      { title: 'Pointage', items: [
        { label: 'Pointage employé',   icon: '☰',  link: '/employees', exact: true, show: () => this.has('employees.view') },
        { label: 'Profil employé',     icon: '✅', link: '/employees/validation', show: () => this.has('pointage.validate') },
      ] },
      { title: 'Affectations', items: [
        { label: 'Assigner compagnies', icon: '⇄', link: '/companies/assign',    show: () => this.has('companies.edit') },
        { label: 'Assigner employés',   icon: '⇄', link: '/employees/assign',    show: () => this.has('employees.edit') },
      ] },
    ] },
    { id: 'finance', label: 'Finances', sections: [
      { title: 'Facturation', items: [
        { label: 'Gérer les factures',     icon: '☰', link: '/invoices', exact: true, show: () => this.has('invoices.view') },
        { label: 'Nouvelle facture',       icon: '＋', link: '/invoices/new',           show: () => this.has('invoices.edit') },
        { label: 'Facturer par pointages', icon: '🕐', link: '/invoices/from-timesheets', show: () => this.has('invoices.edit') },
        { label: 'Envoyer les factures',   icon: '✉', link: '/invoices/send',          show: () => this.has('invoices.send') },
        { label: 'Téléchargement des factures', icon: '📥', link: '/invoices/download', show: () => this.has('invoices.view') },
      ] },
      { title: 'Paie', items: [
        { label: 'Paiements employés', icon: '💰', link: '/employees/payments', show: () => this.has('payments.manage') },
        { label: 'Feuillet T4A',       icon: '📄', link: '/employees/t4a',      show: () => this.has('employees.edit') },
        { label: 'Charges',            icon: '🧾', link: '/charges',            show: () => this.has('invoices.view') },
        { label: 'Relevé bancaire',    icon: '🏦', link: '/bank-statement',     show: () => this.has('payments.manage') },
      ] },
      { title: 'Analyse', items: [
        { label: 'Rapports',     icon: '📋', link: '/invoices/report', show: () => this.has('invoices.view') },
        { label: 'Statistiques', icon: '📊', link: '/stats',           show: () => this.has('stats.view') },
      ] },
    ] },
    { id: 'admin', label: 'Administration', sections: [{ items: [
      { label: 'Groupes',       icon: '🔐', link: '/groups',                show: () => this.has('groups.manage') },
      { label: 'Identifiants',  icon: '🔑', link: '/employees/credentials', show: () => this.has('credentials.manage') },
      { label: 'Configuration', icon: '⚙',  link: '/config',                show: () => this.has('config.manage') },
      { label: 'Suppression définitive', icon: '🗑', link: '/purge',        show: () => this.has('data.purge') },
    ] }] },
  ];

  /** Menus visibles pour l'utilisateur connecté (réévalués quand l'utilisateur ou son équipe change). */
  readonly menus = computed<NavMenu[]>(() => {
    this.auth.user(); this.team.hasTeam();   // dépendances réactives
    return this.NAV_MENUS
      .map(m => ({ ...m, sections: m.sections
        .map(sec => ({ ...sec, items: sec.items.filter(it => it.show()) }))
        .filter(sec => sec.items.length) }))
      .filter(m => m.sections.length);
  });

  private has(p: string): boolean { return this.auth.hasPerm(p); }
  trackMenu(_: number, m: NavMenu): string { return m.id; }

  constructor(public auth: AuthService, public config: ConfigService, public team: TeamService, public theme: ThemeService, private router: Router) {
    // Version = Configuration → Application → Version du tenant courant : rechargée à la connexion
    // et au changement de session (aperçu super-admin), effacée à la déconnexion.
    effect(() => {
      const u = this.auth.user();
      if (u) { this.config.loadVersion(); this.team.load(); this.theme.syncFromAccount(); }   // design enregistré sur le compte
      else   { this.config.clearVersion(); this.team.clear(); }
    });
  }

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
