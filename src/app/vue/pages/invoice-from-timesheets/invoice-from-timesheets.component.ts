import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoiceService, BillableCompanies, BillableCompanyItem, BillCreatePayload } from '../../../state/invoice/invoice.service';

const TPS_RATE = 0.05;
const TVQ_RATE = 0.09975;

export interface EligibleRow extends BillableCompanyItem {
  checked:      boolean;
  pricePerVisit: number;
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
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-from-timesheets.component.html',
  styleUrls: ['./invoice-from-timesheets.component.scss'],
})
export class InvoiceFromTimesheetsComponent implements OnInit {
  loading    = signal(false);
  generating = signal(false);
  error      = signal('');
  success    = signal('');

  period = this._currentPeriod();

  rows:    EligibleRow[]       = [];
  pending: BillableCompanyItem[] = [];

  get allChecked(): boolean  { return this.rows.length > 0 && this.rows.every(r => r.checked); }
  get noneChecked(): boolean { return this.rows.every(r => !r.checked); }
  get checkedRows(): EligibleRow[] { return this.rows.filter(r => r.checked); }

  constructor(
    private invoiceSvc: InvoiceService,
    private cdr:        ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this.load(); }

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
      },
      error: (err: any) => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  toggleAll(checked: boolean): void {
    this.rows.forEach(r => r.checked = checked);
  }

  // ── Générer les factures cochées ──────────────────────────────────────────
  async generateSelected(): Promise<void> {
    const selected = this.checkedRows;
    if (!selected.length) return;

    this.generating.set(true);
    this.error.set('');
    this.success.set('');

    let ok = 0;
    let ko = 0;

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

    this.generating.set(false);
    if (ko === 0)
      this.success.set(`${ok} facture(s) générée(s) avec succès.`);
    else
      this.error.set(`${ok} succès, ${ko} erreur(s). Vérifiez les lignes en rouge.`);

    this.cdr.markForCheck();
  }

  private _createInvoice(row: EligibleRow): Promise<void> {
    const unitPrice = row.totalVisits > 0
      ? +( row.totalAmount / row.totalVisits).toFixed(2)
      : 0;

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
      lines: [{
        id:          crypto.randomUUID(),
        quantity:    row.totalVisits,
        description: `Services de nettoyage — ${this.period}`,
        unitPrice,
        subTotal:    row.totalAmount,
      }],
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
    const tps          = +(co.totalAmount * TPS_RATE).toFixed(2);
    const tvq          = +(co.totalAmount * TVQ_RATE).toFixed(2);
    const totalWithTax = +(co.totalAmount + tps + tvq).toFixed(2);
    const pricePerVisit = co.totalVisits > 0
      ? +(co.totalAmount / co.totalVisits).toFixed(2)
      : 0;
    return { ...co, checked: false, pricePerVisit, tps, tvq, totalWithTax };
  }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
