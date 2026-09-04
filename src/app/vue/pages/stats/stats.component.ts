import { Component, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { StatsService, StatsResponse, StatsCompanyRow } from '../../../state/stats/stats.service';

type FilterMode = 'period' | 'range';
type StatutFilter = 'facturee' | 'nonpayee' | 'payee';

@Component({
  selector: 'app-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './stats.component.html',
  styleUrls: ['./stats.component.scss'],
})
export class StatsComponent {
  // ── Filtres ───────────────────────────────────────────────────────────────
  mode: FilterMode = 'period';

  // Mode période (YYYY-MM)
  period = this._currentPeriod();

  // Mode intervalle
  dateFrom = '';
  dateTo   = '';

  // ── État ──────────────────────────────────────────────────────────────────
  loading      = signal(false);
  error        = signal('');
  stats        = signal<StatsResponse | null>(null);
  regrouper    = signal(false);
  statutFilter = signal<StatutFilter>('facturee');

  private destroyRef = inject(DestroyRef);

  constructor(
    private statsSvc: StatsService,
    private cdr:      ChangeDetectorRef,
  ) {}

  // ── Calculé ───────────────────────────────────────────────────────────────

  /** Compagnies du tableau "Revenus par compagnie" filtrées par statut (curseur Facturée/Non payée/Payée). */
  filteredCompanies = computed(() => {
    const rows = this.stats()?.parCompagnie ?? [];
    switch (this.statutFilter()) {
      case 'payee':    return rows.filter(r => r.aPayee);
      case 'nonpayee': return rows.filter(r => !r.aPayee);
      default:         return rows; // 'facturee' = toutes les compagnies facturées
    }
  });

  totalNbAvoirs = computed(() =>
    this.filteredCompanies().reduce((s, r) => s + r.nbAvoirs, 0)
  );

  totalAvoirsSum = computed(() =>
    this.filteredCompanies().reduce((s, r) => s + r.totalAvoirs, 0)
  );

  totalFactures  = computed(() => this.filteredCompanies().reduce((s, r) => s + r.nbFactures, 0));
  totalVisites   = computed(() => this.filteredCompanies().reduce((s, r) => s + r.nbVisites, 0));
  totalHT        = computed(() => this.filteredCompanies().reduce((s, r) => s + r.totalHT, 0));
  totalTPSFilt   = computed(() => this.filteredCompanies().reduce((s, r) => s + r.totalTPS, 0));
  totalTVQFilt   = computed(() => this.filteredCompanies().reduce((s, r) => s + r.totalTVQ, 0));
  totalTTCFilt   = computed(() => this.filteredCompanies().reduce((s, r) => s + r.totalTTC, 0));
  totalPayeFilt  = computed(() => this.filteredCompanies().reduce((s, r) => s + r.montantPaye, 0));
  totalEnAttenteFilt = computed(() =>
    this.totalTTCFilt() - this.totalAvoirsSum() - this.totalPayeFilt()
  );

  // ── Chargement ────────────────────────────────────────────────────────────
  load(): void {
    this.error.set('');
    this.stats.set(null);

    if (this.mode === 'period') {
      if (!this.period) { this.error.set('Sélectionnez une période.'); return; }
      this._fetch(this.statsSvc.getByPeriod(this.period));
    } else {
      if (!this.dateFrom || !this.dateTo) { this.error.set('Sélectionnez les deux dates.'); return; }
      if (this.dateFrom > this.dateTo)    { this.error.set('La date de début doit être avant la date de fin.'); return; }
      this._fetch(this.statsSvc.getByRange(this.dateFrom, this.dateTo));
    }
  }

  private _fetch(obs: ReturnType<StatsService['getByPeriod']>): void {
    this.loading.set(true);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.stats.set(data);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  periodeLabel(): string {
    const s = this.stats();
    if (!s) return '';
    if (s.dateDebut === s.dateFin) return s.dateDebut;
    return `${s.dateDebut} → ${s.dateFin}`;
  }

  trackByCode(_: number, row: StatsCompanyRow) { return row.companyCode; }

  statutLabel(): string {
    switch (this.statutFilter()) {
      case 'payee':    return 'Payée';
      case 'nonpayee': return 'Non payée';
      default:         return 'Facturée';
    }
  }

  // ── Navigation détail (nouvel onglet) ────────────────────────────────────
  private _rangeQuery(): string {
    return this.mode === 'period'
      ? `period=${encodeURIComponent(this.period)}`
      : `from=${encodeURIComponent(this.dateFrom)}&to=${encodeURIComponent(this.dateTo)}`;
  }

  openEmployee(row: { employeeId: string }): void {
    window.open(`/stats/employee/${row.employeeId}?${this._rangeQuery()}`, '_blank');
  }

  openCompany(row: StatsCompanyRow): void {
    if (!row.companyId || row.companyId === '00000000-0000-0000-0000-000000000000') return;
    window.open(`/stats/company/${row.companyId}?${this._rangeQuery()}`, '_blank');
  }
}
