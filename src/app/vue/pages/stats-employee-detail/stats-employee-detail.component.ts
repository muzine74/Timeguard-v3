import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { StatsService, StatsEmployeeDetailResponse } from '../../../state/stats/stats.service';

@Component({
  selector: 'app-stats-employee-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './stats-employee-detail.component.html',
  styleUrls: ['./stats-employee-detail.component.scss'],
})
export class StatsEmployeeDetailComponent implements OnInit {
  loading = signal(false);
  error   = signal('');
  detail  = signal<StatsEmployeeDetailResponse | null>(null);

  private destroyRef = inject(DestroyRef);

  constructor(
    private route:    ActivatedRoute,
    private statsSvc: StatsService,
    private cdr:      ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.error.set('Employé introuvable.'); return; }

    const qp     = this.route.snapshot.queryParamMap;
    const period = qp.get('period') ?? undefined;
    const from   = qp.get('from')   ?? undefined;
    const to     = qp.get('to')     ?? undefined;

    if (!period && !(from && to)) {
      this.error.set('Plage de dates manquante.');
      return;
    }

    this.loading.set(true);
    this.statsSvc.getEmployeeDetail(id, { period, from, to })
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

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  totalVisites(): number {
    return (this.detail()?.companies ?? []).reduce((s, c) => s + c.nbVisites, 0);
  }

  totalPaiement(): number {
    return (this.detail()?.companies ?? []).reduce((s, c) => s + c.totalPaiement, 0);
  }
}
