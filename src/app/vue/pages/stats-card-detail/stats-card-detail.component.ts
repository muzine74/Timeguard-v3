import { Component, OnInit, signal, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { StatsService, StatsCardDetail, StatsDetailCell } from '../../../state/stats/stats.service';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { ExportDoc, TableExportService } from '../../../state/export/table-export.service';

/** Détail d'une carte de la page Statistiques : d'où vient le montant (ouvert dans un nouvel onglet). */
@Component({
    selector: 'app-stats-card-detail',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, ExportButtonsComponent],
    templateUrl: './stats-card-detail.component.html',
    styleUrls: ['./stats-card-detail.component.scss']
})
export class StatsCardDetailComponent implements OnInit {
  loading = signal(false);
  error   = signal('');
  detail  = signal<StatsCardDetail | null>(null);

  private destroyRef = inject(DestroyRef);
  private route      = inject(ActivatedRoute);
  private statsSvc   = inject(StatsService);

  ngOnInit(): void {
    const key    = this.route.snapshot.paramMap.get('key') ?? '';
    const qp     = this.route.snapshot.queryParamMap;
    const period = qp.get('period') ?? undefined;
    const from   = qp.get('from')   ?? undefined;
    const to     = qp.get('to')     ?? undefined;

    if (!period && !(from && to)) { this.error.set('Plage de dates manquante.'); return; }

    this.loading.set(true);
    this.statsSvc.getCardDetail(key, { period, from, to })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => { this.detail.set(data); this.loading.set(false); },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.loading.set(false);
        },
      });
  }

  periodeLabel(): string {
    const d = this.detail();
    if (!d) return '';
    return d.dateDebut === d.dateFin ? d.dateDebut : `${d.dateDebut} → ${d.dateFin}`;
  }

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  /** Cellule affichée selon le type de sa colonne (montant, entier ou texte). */
  cell(value: StatsDetailCell, type: string): string {
    if (value === null || value === '') return '';
    return type === 'money' && typeof value === 'number' ? this.fmt(value) : String(value);
  }

  isNegative(value: StatsDetailCell): boolean { return typeof value === 'number' && value < 0; }

  export = (): ExportDoc => {
    const d = this.detail()!;
    return {
      fileName: TableExportService.fileName('Statistiques', d.title, this.periodeLabel()),
      title: 'Statistiques',
      subtitle: `Période : ${this.periodeLabel()} — ${d.explanation}`,
      landscape: d.columns.length > 5,
      tables: [{
        title: d.title,
        columns: d.columns.map((c, i) => ({ header: c.header, ...(c.type === 'text' ? { width: i === 0 ? 30 : 18 } : { type: c.type }) })),
        rows: [
          ...d.rows.map(r => ({ cells: r })),
          { kind: 'total' as const, cells: d.totalRow },
        ],
      }],
    };
  };
}
