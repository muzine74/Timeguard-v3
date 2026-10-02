import { Component, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import { StatsService, StatsResponse, StatsCompanyRow, StatsInvoiceRow } from '../../../state/stats/stats.service';
import { TableSort, SortValue } from '../../shared/table-sort';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { ExportDoc, ExportRow, TableExportService } from '../../../state/export/table-export.service';

type FilterMode = 'period' | 'range';
type StatutFilter = 'facturee' | 'nonpayee' | 'payee';

type InvoiceSortKey = 'num' | 'period' | 'date' | 'visits' | 'ht' | 'tps' | 'tvq' | 'status' | 'ttc';
const AMOUNT: Partial<Record<InvoiceSortKey, 'totalHT' | 'totalTPS' | 'totalTVQ' | 'totalTTC'>> =
  { ht: 'totalHT', tps: 'totalTPS', tvq: 'totalTVQ', ttc: 'totalTTC' };

/** Compagnie avec ses factures retenues par le filtre de statut. */
export interface CompanyGroup {
  key:      string;
  company:  StatsCompanyRow;
  invoices: StatsInvoiceRow[];
  total:    number;
}

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

@Component({
  selector: 'app-stats',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ExportButtonsComponent],
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

  /** Groupes repliés par défaut : clés des compagnies dépliées. */
  expanded = signal<ReadonlySet<string>>(new Set());

  /**
   * Factures retenues par le filtre de statut, regroupées par compagnie.
   * Un avoir suit le statut de sa facture d'origine (il en réduit le montant dû).
   */
  groups = computed<CompanyGroup[]>(() => {
    const statut = this.statutFilter();
    return (this.stats()?.parCompagnie ?? []).map(company => {
      const factures = company.factures ?? [];
      const paidById = new Map(factures.map(f => [f.billIdentifier, f.isPaid]));
      const invoices = factures.filter(f => {
        if (statut === 'facturee') return true;
        const paid = f.isAvoir && f.parentBillIdentifier != null && paidById.has(f.parentBillIdentifier)
          ? paidById.get(f.parentBillIdentifier)!
          : f.isPaid;
        return statut === 'payee' ? paid : !paid;
      });
      return { key: this.groupKey(company), company, invoices, total: this._sum(invoices, 'totalTTC') };
    }).filter(g => g.invoices.length > 0);
  });

  /** Tri au clic sur l'en-tête : factures triées dans chaque compagnie, compagnies triées
   *  par leur total de la colonne (montants, visites), leur nom (1re colonne) ou leur 1re facture. */
  readonly sort = new TableSort<InvoiceSortKey>(['date', 'visits', 'ht', 'tps', 'tvq', 'ttc']);

  sortedGroups = computed<CompanyGroup[]>(() => {
    const key = this.sort.key();
    const groups = this.groups();
    if (!key) return groups;
    const withInvoices = groups.map(g => ({ ...g, invoices: this.sort.apply(g.invoices, (f, k) => this._invoiceValue(f, k)) }));
    return this.sort.apply(withInvoices, (g, k) => {
      if (k === 'num') return g.company.companyName;
      if (k === 'visits') return g.invoices.filter(f => !f.isAvoir).reduce((s, f) => s + f.nbVisites, 0);
      const amount = AMOUNT[k];
      if (amount) return k === 'ttc' ? g.total : this._sum(g.invoices, amount);
      return g.invoices.length ? this._invoiceValue(g.invoices[0], k) : null;
    });
  });

  private _invoiceValue(f: StatsInvoiceRow, k: InvoiceSortKey): SortValue {
    switch (k) {
      case 'num':    return f.billNumber;
      case 'period': return f.period;
      case 'date':   return f.billedDate;
      case 'visits': return f.isAvoir ? null : f.nbVisites;
      case 'status': return this.invoiceStatus(f);
      default:       return f[AMOUNT[k]!];
    }
  }

  private _shown = computed(() => this.groups().flatMap(g => g.invoices));
  totalCount = computed(() => this._shown().length);
  totalHT    = computed(() => this._sum(this._shown(), 'totalHT'));
  totalTPS   = computed(() => this._sum(this._shown(), 'totalTPS'));
  totalTVQ   = computed(() => this._sum(this._shown(), 'totalTVQ'));
  totalTTC   = computed(() => this._sum(this._shown(), 'totalTTC'));
  totalVisites = computed(() => this._shown().filter(f => !f.isAvoir).reduce((s, f) => s + f.nbVisites, 0));
  allExpanded  = computed(() => this.groups().length > 0 && this.groups().every(g => this.expanded().has(g.key)));

  private _sum(rows: StatsInvoiceRow[], k: 'totalHT' | 'totalTPS' | 'totalTVQ' | 'totalTTC'): number {
    return Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;
  }

  groupKey(c: StatsCompanyRow): string { return c.companyId && c.companyId !== EMPTY_ID ? c.companyId : c.companyCode; }
  trackGroup(_: number, g: CompanyGroup) { return g.key; }
  trackInvoice(_: number, f: StatsInvoiceRow) { return f.billIdentifier; }

  isOpen(key: string): boolean { return this.expanded().has(key); }

  toggle(key: string): void {
    const next = new Set(this.expanded());
    next.has(key) ? next.delete(key) : next.add(key);
    this.expanded.set(next);
  }

  toggleAll(): void {
    this.expanded.set(this.allExpanded() ? new Set() : new Set(this.groups().map(g => g.key)));
  }

  invoiceStatus(f: StatsInvoiceRow): string {
    if (f.isAvoir) return 'Avoir';
    if (f.isPaid)  return 'Payée';
    return f.isSent ? 'Envoyée' : 'Non envoyée';
  }

  // ── Exports (ce qui est affiché : filtre de statut et tri appliqués, groupes tous dépliés) ──
  private _exportSubtitle(): string {
    return `Période : ${this.periodeLabel()}`;
  }

  exportEmployees = (): ExportDoc => {
    const s = this.stats()!;
    return {
      fileName: TableExportService.fileName('Paiements_employes', this.periodeLabel()),
      title: 'Statistiques',
      subtitle: this._exportSubtitle(),
      tables: [{
        title: 'Paiements employés',
        columns: [{ header: 'Employé', width: 32 }, { header: 'Visites', type: 'int' }, { header: 'Paiement', type: 'money' }],
        rows: [
          ...s.parEmploye.map(r => ({ cells: [r.employeeName, r.nbVisites, r.totalPaiementEmploye] })),
          { kind: 'total', cells: ['Total', s.nbVisitesTotal, s.totalPaiementsEmployes] },
        ],
      }],
    };
  };

  exportInvoices = (): ExportDoc => {
    const rows: ExportRow[] = [];
    for (const g of this.sortedGroups()) {
      const n = g.invoices.length;
      rows.push({ kind: 'group', cells: [
        `${g.company.companyName || '—'} (${n} facture${n > 1 ? 's' : ''})`, '', '',
        g.invoices.filter(f => !f.isAvoir).reduce((t, f) => t + f.nbVisites, 0),
        this._sum(g.invoices, 'totalHT'), this._sum(g.invoices, 'totalTPS'), this._sum(g.invoices, 'totalTVQ'), '', g.total,
      ] });
      for (const f of g.invoices) {
        rows.push({ kind: 'detail', cells: [
          f.billNumber, f.period, (f.billedDate ?? '').slice(0, 10), f.isAvoir ? null : f.nbVisites,
          f.totalHT, f.totalTPS, f.totalTVQ, this.invoiceStatus(f), f.totalTTC,
        ] });
      }
    }
    const nc = this.groups().length, nf = this.totalCount();
    rows.push({ kind: 'total', cells: [
      `Total : ${nc} compagnie${nc > 1 ? 's' : ''}, ${nf} facture${nf > 1 ? 's' : ''}`, '', '', this.totalVisites(),
      this.totalHT(), this.totalTPS(), this.totalTVQ(), '', this.totalTTC(),
    ] });
    return {
      fileName: TableExportService.fileName('Factures_par_compagnie', this.statutLabel(), this.periodeLabel()),
      title: 'Statistiques',
      subtitle: `${this._exportSubtitle()} — factures : ${this.statutLabel()}`,
      landscape: true,
      tables: [{
        title: 'Factures par compagnie',
        columns: [
          { header: 'Compagnie / N° facture', width: 36 }, { header: 'Période', width: 10 }, { header: 'Émise le', width: 12 },
          { header: 'Visites', type: 'int' }, { header: 'Total HT', type: 'money' }, { header: 'TPS', type: 'money' },
          { header: 'TVQ', type: 'money' }, { header: 'Statut', width: 13 }, { header: 'Total TTC', type: 'money' },
        ],
        rows,
      }],
    };
  };

  // ── Chargement ────────────────────────────────────────────────────────────
  load(): void {
    this.error.set('');
    this.stats.set(null);
    this.expanded.set(new Set());

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

  canOpenCompany(row: StatsCompanyRow): boolean { return !!row.companyId && row.companyId !== EMPTY_ID; }

  openCompany(row: StatsCompanyRow): void {
    if (!this.canOpenCompany(row)) return;
    window.open(`/stats/company/${row.companyId}?${this._rangeQuery()}`, '_blank');
  }
}
