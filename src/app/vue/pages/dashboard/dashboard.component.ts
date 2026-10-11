import { Component, OnInit, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { DashboardService, Dashboard } from '../../../state/dashboard/dashboard.service';
import { httpErrorMessage } from '../../shared/http-error';
import { IconComponent } from '../../components/icon/icon.component';
import { I18nService } from '../../../state/i18n/i18n.service';

interface Shortcut { label: string; icon: string; link: string; perm: string | string[]; }

/** Page d'accueil : ce qui demande l'attention de l'utilisateur, puis ses raccourcis. */
@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, RouterLink, IconComponent],
    templateUrl: './dashboard.component.html',
    styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  data    = signal<Dashboard | null>(null);
  loading = signal(true);
  error   = signal('');

  private readonly SHORTCUTS: Shortcut[] = [
    { label: 'Pointage',            icon: 'clock',      link: '/pointage',                  perm: 'pointage.view' },
    { label: 'Pointage employé',    icon: 'list',       link: '/employees',                 perm: 'employees.view' },
    { label: 'Valider les semaines', icon: 'user-check', link: '/employees/validation',     perm: 'pointage.validate' },
    { label: 'Facturer par pointages', icon: 'file-plus', link: '/invoices/from-timesheets', perm: 'invoices.edit' },
    { label: 'Envoyer les factures', icon: 'mail',      link: '/invoices/send',             perm: 'invoices.send' },
    { label: 'Gérer les factures',  icon: 'file',       link: '/invoices',                  perm: 'invoices.view' },
    { label: 'Paiements employés',  icon: 'card',       link: '/employees/payments',        perm: 'payments.manage' },
    { label: 'Charges',             icon: 'bag',        link: '/charges',                   perm: 'invoices.view' },
    { label: 'Statistiques',        icon: 'chart',      link: '/stats',                     perm: 'stats.view' },
    { label: 'Communications',      icon: 'message',    link: '/communications',            perm: ['companies.edit', 'employees.edit'] },
    { label: 'Compagnies',          icon: 'building',   link: '/companies/edit',            perm: 'companies.edit' },
    { label: 'Notes',               icon: 'note',       link: '/notes',                     perm: [] },
  ];

  readonly shortcuts = computed(() => {
    this.auth.user();   // dépendance réactive
    return this.SHORTCUTS.filter(s => {
      const perms = Array.isArray(s.perm) ? s.perm : [s.perm];
      return perms.length === 0 || this.auth.isSuperUser() || perms.some(p => this.auth.hasPerm(p));
    });
  });

  /** Nombre de sujets qui demandent une action (pour la phrase d'en-tête). */
  readonly attention = computed(() => {
    const d = this.data();
    if (!d) return 0;
    return [d.weeks?.count, d.invoices?.toSendCount, d.invoices?.unpaidCount, d.payments?.count].filter(n => (n ?? 0) > 0).length;
  });

  /** Premiers pas : étapes de mise en route, affichées tant qu'elles ne sont pas toutes faites. */
  readonly setupSteps = computed(() => {
    const s = this.data()?.setup;
    if (!s || s.done) return [];
    return [
      { done: s.companyInfo,   label: 'Renseigner votre entreprise', hint: 'Nom, adresse et numéros de taxes : ils apparaissent sur vos factures.', link: '/config', cta: 'Ouvrir la configuration' },
      { done: s.companies > 0, label: 'Créer une première compagnie cliente', hint: 'Avec ses jours de travail et ses prix.', link: '/companies/new', cta: 'Nouvelle compagnie' },
      { done: s.employees > 0, label: 'Ajouter un employé', hint: 'Puis l\'assigner aux compagnies où il travaille.', link: '/employees/new', cta: 'Nouvel employé' },
      { done: s.timeLogs,      label: 'Saisir un premier pointage', hint: 'Les journées travaillées servent à la paie et à la facturation.', link: '/employees', cta: 'Pointage employé' },
      { done: s.invoices,      label: 'Créer une première facture', hint: 'À partir des pointages validés.', link: '/invoices/from-timesheets', cta: 'Facturer par pointages' },
      { done: s.smtp,          label: 'Configurer l\'envoi des courriels', hint: 'Pour envoyer les factures aux clients directement depuis TimeGuard.', link: '/config', cta: 'Ouvrir la configuration' },
    ];
  });
  readonly setupDone = computed(() => this.setupSteps().filter(s => s.done).length);

  readonly hasSections = computed(() => {
    const d = this.data();
    return !!d && !!(d.weeks || d.invoices || d.payments || d.charges);
  });

  constructor(public auth: AuthService, private svc: DashboardService, private i18n: I18nService) {}

  /** Format des dates selon la langue d'affichage. */
  private get _locale(): string {
    return ({ fr: 'fr-CA', en: 'en-CA', es: 'es', it: 'it' } as const)[this.i18n.lang()];
  }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.svc.get().subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: err => { this.error.set(httpErrorMessage(err, 'Impossible de charger le tableau de bord')); this.loading.set(false); },
    });
  }

  get greeting(): string {
    const h = new Date().getHours();
    return h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
  }

  get userName(): string { return this.auth.user()?.username ?? ''; }

  /** Date yyyy-MM-dd affichée en clair, sans décalage de fuseau horaire. */
  day(d: string | null | undefined, withYear = false): string {
    if (!d) return '';
    return new Date(d + 'T12:00:00').toLocaleDateString(this._locale, withYear
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short' });
  }

  monthName(month: string): string {
    return new Date(month + '-15T12:00:00').toLocaleDateString(this._locale, { month: 'long', year: 'numeric' });
  }
}
