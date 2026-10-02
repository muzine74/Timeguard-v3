import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { NotesService, NoteItem } from '../../../state/notes/notes.service';
import { NoteInlineComponent } from '../../components/note-inline/note-inline.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoiceService, BillableCompanies, BillableCompanyItem, BillablePriceGroup, BillCreatePayload } from '../../../state/invoice/invoice.service';
import { ConfigService } from '../../../state/config/config.service';
import { TableSort, SortValue } from '../../shared/table-sort';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { ExportDoc, TableExportService } from '../../../state/export/table-export.service';

type EligibleSortKey = 'name' | 'visits' | 'subtotal' | 'tps' | 'tvq' | 'ttc' | 'result' | 'planned';

export interface EligibleRow extends BillableCompanyItem {
  checked:      boolean;
  tps:          number;
  tvq:          number;
  totalWithTax: number;
  /** Résultat après génération : numéro de facture ou message d'erreur */
  genResult?:   { ok: boolean; label: string };
}

@Component({
  selector: 'app-invoice-from-timesheets',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NoteInlineComponent, ExportButtonsComponent],
  templateUrl: './invoice-from-timesheets.component.html',
  styleUrls: ['./invoice-from-timesheets.component.scss'],
})
export class InvoiceFromTimesheetsComponent implements OnInit {
  private readonly noteAlerts = inject(NoteAlertService);
  loading    = signal(false);
  generating = signal(false);
  error      = signal('');
  success    = signal('');

  period = this._currentPeriod();

  rows:    EligibleRow[]       = [];
  pending: BillableCompanyItem[] = [];

  /** Notes actives par compagnie (clé = companyId en minuscules), chargées en une requête. */
  private notesByCompany = new Map<string, NoteItem[]>();
  private static readonly NO_NOTES: NoteItem[] = [];
  private notesSvc = inject(NotesService);

  get allChecked(): boolean  { return this.rows.length > 0 && this.rows.every(r => r.checked); }
  get noneChecked(): boolean { return this.rows.every(r => !r.checked); }
  get checkedRows(): EligibleRow[] { return this.rows.filter(r => r.checked); }
  get hasAnyDiscrepancy(): boolean { return this.rows.some(r => this.hasDiscrepancy(r)); }

  /** Tri des compagnies éligibles au clic sur l'en-tête (montants : décroissant au 1er clic). */
  readonly sort = new TableSort<EligibleSortKey>(['visits', 'subtotal', 'tps', 'tvq', 'ttc', 'result', 'planned']);
  get sortedRows(): EligibleRow[] { return this.sort.apply(this.rows, (r, k) => this._sortValue(r, k)); }

  /** Export : compagnies éligibles (ordre du tri affiché) + compagnies en attente de validation. */
  exportEligible = (): ExportDoc => {
    const money = (v: number) => v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
    const detail = (r: BillableCompanyItem) => r.priceGroups?.length
      ? r.priceGroups.map(g => g.isHourly
          ? `${g.hours ?? 0} h x ${money(g.unitPrice)}/h = ${money(g.subtotal)}`
          : `${g.visits} x ${money(g.unitPrice)} = ${money(g.subtotal)}`).join(' ; ')
      : `${r.totalVisits} visite(s)`;
    const rows = this.sortedRows;
    const sum = (k: 'totalAmount' | 'tps' | 'tvq' | 'totalWithTax') => Math.round(rows.reduce((t, r) => t + r[k], 0) * 100) / 100;
    return {
      fileName: TableExportService.fileName('Facturation_par_pointages', this.period),
      title: 'Facturation par pointages',
      subtitle: `Période : ${this.period}`,
      landscape: true,
      tables: [
        {
          title: 'Compagnies éligibles',
          columns: [
            { header: 'Compagnie', width: 30 }, { header: 'Code', width: 12 }, { header: 'Visites / prix', width: 34 },
            { header: 'Sous-total', type: 'money' }, { header: 'TPS', type: 'money' }, { header: 'TVQ', type: 'money' },
            { header: 'Total TTC', type: 'money' }, { header: 'Écart planning', width: 12 },
            { header: 'Jours planifiés', width: 16 }, { header: 'Montant planifié', type: 'money', width: 16 },
          ],
          rows: [
            ...rows.map(r => ({ cells: [
              r.companyName, r.companyCode, detail(r), r.totalAmount, r.tps, r.tvq, r.totalWithTax,
              this.hasDiscrepancy(r) ? 'Oui' : 'Non',
              r.hourlyBilling ? "Facturé à l'heure" : r.planningIncomplete ? 'Planning incomplet' : r.plannedDays,
              r.hourlyBilling || r.planningIncomplete ? null : r.plannedAmount,
            ] })),
            { kind: 'total' as const, cells: [`Total : ${rows.length} compagnie(s)`, '', '', sum('totalAmount'), sum('tps'), sum('tvq'), sum('totalWithTax'), '', '', null] },
          ],
        },
        {
          title: 'En attente de validation',
          columns: [
            { header: 'Compagnie', width: 30 }, { header: 'Code', width: 12 }, { header: 'Visites', type: 'int' },
            { header: 'Montant brut', type: 'money' }, { header: 'Semaines non validées', width: 40 },
          ],
          rows: this.pending.length
            ? this.pending.map(c => ({ cells: [c.companyName, c.companyCode, c.totalVisits, c.totalAmount, c.pendingWeeks.join(', ')] }))
            : [{ cells: ['Aucune compagnie en attente', '', null, null, ''] }],
        },
      ],
    };
  };

  private _sortValue(r: EligibleRow, k: EligibleSortKey): SortValue {
    switch (k) {
      case 'name':     return r.companyName;
      case 'visits':   return r.totalVisits;
      case 'subtotal': return r.totalAmount;
      case 'tps':      return r.tps;
      case 'tvq':      return r.tvq;
      case 'ttc':      return r.totalWithTax;
      case 'result':   return this.hasDiscrepancy(r);              // écarts d'abord au 1er clic
      case 'planned':  return r.hourlyBilling || r.planningIncomplete ? null : r.plannedAmount;
    }
  }

  private _tpsRate   = 0.05;
  private _tvqRate   = 0.09975;
  private destroyRef = inject(DestroyRef);

  constructor(
    private invoiceSvc: InvoiceService,
    private configSvc:  ConfigService,
    private cdr:        ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.configSvc.get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          if (data.config.tpsRate != null) this._tpsRate = data.config.tpsRate / 100;
          if (data.config.tvqRate != null) this._tvqRate = data.config.tvqRate / 100;
          this.cdr.markForCheck();
        },
      });
    this.load();
  }

  load(): void {
    if (!this.period) return;
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    this.rows    = [];
    this.pending = [];

    this.invoiceSvc.getEligible(this.period).subscribe({
      next: (data: BillableCompanies) => {
        this.rows = data.eligible.map(co => this._toRow(co));
        this.pending = data.pending;
        this.loading.set(false);
        this.cdr.markForCheck();
        this._loadCompanyNotes();
      },
      error: (err: any) => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  notesFor(co: BillableCompanyItem): NoteItem[] {
    return this.notesByCompany.get(co.companyId?.toLowerCase()) ?? InvoiceFromTimesheetsComponent.NO_NOTES;
  }

  /** Cocher une compagnie = préparer sa facture → afficher ses notes actives. */
  onRowToggle(row: EligibleRow): void {
    if (row.checked) this.noteAlerts.show(this.notesFor(row), `Facturation — ${row.companyName}`);
  }

  private _loadCompanyNotes(): void {
    this.notesByCompany = new Map();
    const companyIds = [...this.rows, ...this.pending].map(c => c.companyId);
    if (!companyIds.length) return;

    this.notesSvc.getAlerts({ companyIds }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: notes => {
        const map = new Map<string, NoteItem[]>();
        for (const n of notes) {
          for (const l of n.links) {
            if (l.entityType !== 'company') continue;
            const key = l.entityId.toLowerCase();
            map.set(key, [...(map.get(key) ?? []), n]);
          }
        }
        this.notesByCompany = map;
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  toggleAll(checked: boolean): void {
    this.rows.forEach(r => r.checked = checked);
  }

  // ── Générer les factures cochées ──────────────────────────────────────────
  async generateSelected(): Promise<void> {
    const selected = this.checkedRows; // snapshot avant tout await
    if (!selected.length) return;

    this.noteAlerts.check({ companyIds: selected.map(r => r.companyId) }, 'Facturation depuis les pointages');
    this.generating.set(true);
    this.error.set('');
    this.success.set('');

    let ok = 0;
    let ko = 0;

    try {
      for (const row of selected) {
        try {
          await this._createInvoice(row);
          row.genResult = { ok: true, label: row.genResult?.label ?? '✓' };
          ok++;
        } catch {
          row.genResult = { ok: false, label: '✕ Erreur' };
          ko++;
        }
        this.cdr.markForCheck();
      }

      if (ko === 0)
        this.success.set(`${ok} facture(s) générée(s) avec succès.`);
      else
        this.error.set(`${ok} succès, ${ko} erreur(s). Vérifiez les lignes en rouge.`);
    } finally {
      this.generating.set(false);
      this.cdr.markForCheck();
    }
  }

  private _createInvoice(row: EligibleRow): Promise<void> {
    const lines = (row.priceGroups?.length ? row.priceGroups : [{
      unitPrice: row.totalVisits > 0 ? +(row.totalAmount / row.totalVisits).toFixed(2) : 0,
      visits:    row.totalVisits,
      subtotal:  row.totalAmount,
    } as BillablePriceGroup]).map(g => ({
      id:          crypto.randomUUID(),
      quantity:    g.isHourly ? +(g.hours ?? 0) : g.visits,
      description: g.isHourly
        ? `Services de nettoyage — ${this.period} (heures)`
        : `Services de nettoyage — ${this.period}`,
      unitPrice:   +g.unitPrice,
      subTotal:    +g.subtotal,
    }));

    const payload: BillCreatePayload = {
      companyName:    row.companyName,
      companyCode:    row.companyCode,
      period:         this.period,
      billedDate:     new Date().toISOString().split('T')[0],
      companyPrice:   row.totalAmount,
      numberOfVisits: row.totalVisits,
      totalBeforeTax: row.totalAmount,
      tps:            row.tps,
      tvq:            row.tvq,
      totalWithTax:   row.totalWithTax,
      note:           '',
      paymentInfo:    '',
      lines,
    };

    return new Promise((resolve, reject) => {
      this.invoiceSvc.create(payload).subscribe({
        next: res => {
          row.genResult = { ok: true, label: res.billNumber };
          resolve();
        },
        error: reject,
      });
    });
  }

  private _toRow(co: BillableCompanyItem): EligibleRow {
    const tps          = +(co.totalAmount * this._tpsRate).toFixed(2);
    const tvq          = +(co.totalAmount * this._tvqRate).toFixed(2);
    const totalWithTax = +(co.totalAmount + tps + tvq).toFixed(2);
    return { ...co, checked: false, tps, tvq, totalWithTax };
  }

  /** Écart entre le montant planifié (calendrier tarifaire) et le montant réel (pointages). */
  hasDiscrepancy(row: EligibleRow): boolean {
    if (row.planningIncomplete) return false;   // rien à comparer sans planning calculable
    if (row.hourlyBilling) return false;        // facturée à l'heure : pas de jours planifiés
    return Math.abs(row.plannedAmount - row.totalAmount) > 0.01;
  }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
