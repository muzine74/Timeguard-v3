import { Component, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { StatsService, StatsResponse, StatsCompanyRow } from '../../../state/stats/stats.service';

type FilterMode = 'period' | 'range';

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
  loading   = signal(false);
  error     = signal('');
  stats     = signal<StatsResponse | null>(null);
  regrouper = signal(false);

  private destroyRef = inject(DestroyRef);

  constructor(
    private statsSvc: StatsService,
    private cdr:      ChangeDetectorRef,
  ) {}

  // ── Calculé ───────────────────────────────────────────────────────────────
  totalNbAvoirs = computed(() =>
    (this.stats()?.parCompagnie ?? []).reduce((s, r) => s + r.nbAvoirs, 0)
  );

  totalAvoirsSum = computed(() =>
    (this.stats()?.parCompagnie ?? []).reduce((s, r) => s + r.totalAvoirs, 0)
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
}
