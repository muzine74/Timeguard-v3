import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { StatsService, StatsCompanyDetailResponse } from '../../../state/stats/stats.service';

@Component({
  selector: 'app-stats-company-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './stats-company-detail.component.html',
  styleUrls: ['./stats-company-detail.component.scss'],
})
export class StatsCompanyDetailComponent implements OnInit {
  loading = signal(false);
  error   = signal('');
  detail  = signal<StatsCompanyDetailResponse | null>(null);

  private destroyRef = inject(DestroyRef);

  constructor(
    private route:    ActivatedRoute,
    private statsSvc: StatsService,
    private cdr:      ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error.set('Compagnie introuvable.'); return; }

    const qp     = this.route.snapshot.queryParamMap;
    const period = qp.get('period') ?? undefined;
    const from   = qp.get('from')   ?? undefined;
    const to     = qp.get('to')     ?? undefined;

    if (!period && !(from && to)) {
      this.error.set('Plage de dates manquante.');
      return;
    }

    this.loading.set(true);
    this.statsSvc.getCompanyDetail(id, { period, from, to })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.detail.set(data);
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

  periodeLabel(): string {
    const d = this.detail();
    if (!d) return '';
    return d.dateDebut === d.dateFin ? d.dateDebut : `${d.dateDebut} → ${d.dateFin}`;
  }

  fmtDate(iso: string): string {
    const M = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    const [, m, d] = iso.split('-').map(Number);
    return `${d} ${M[m - 1]}`;
  }

  totalVisites(): number {
    return (this.detail()?.employees ?? []).reduce((s, e) => s + e.nbVisites, 0);
  }
}
