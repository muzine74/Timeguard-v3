import { Component, OnInit, signal, computed, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CompanyService, CompanySummary } from '../../../state/compagny/Company.service';
import { InvoiceService, BillLine, BillCreatePayload } from '../../../state/invoice/invoice.service';

const TPS_RATE = 0.05;
const TVQ_RATE = 0.09975;

@Component({
  selector: 'app-invoice-generate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-generate.component.html',
  styleUrls: ['./invoice-generate.component.scss'],
})
export class InvoiceGenerateComponent implements OnInit {
  saved   = signal(false);
  sent    = signal(false);
  error   = signal('');
  saving  = signal(false);

  // ── Compagnies ────────────────────────────────────────
  companies    = signal<CompanySummary[]>([]);
  coLoading    = signal(true);
  selectedCo   = signal<CompanySummary | null>(null);
  coSearch     = '';

  get filteredCompanies(): CompanySummary[] {
    const q = this.coSearch.toLowerCase();
    return q
      ? this.companies().filter(c => c.companyName.toLowerCase().includes(q))
      : this.companies();
  }

  // ── Formulaire facture ────────────────────────────────
  period        = this._currentPeriod();
  billedDate    = new Date().toISOString().split('T')[0];
  numberOfVisits = 0;
  note          = '';
  lines: BillLine[] = [];

  // ── Totaux calculés ───────────────────────────────────
  get subtotal(): number {
    return this.lines.reduce((s, l) => s + l.subTotal, 0);
  }
  get tpsAmount(): number  { return +(this.subtotal * TPS_RATE).toFixed(2); }
  get tvqAmount(): number  { return +(this.subtotal * TVQ_RATE).toFixed(2); }
  get totalTtc(): number   { return +(this.subtotal + this.tpsAmount + this.tvqAmount).toFixed(2); }

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[InvoiceGenerate]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[InvoiceGenerate]', ...a); }

  constructor(
    private companySvc:  CompanyService,
    private invoiceSvc:  InvoiceService,
    private router:      Router,
  ) {}

  ngOnInit(): void {
    this.companySvc.getAll().subscribe({
      next: list => {
        this.companies.set(list.filter(c => c.isActive));
        this.coLoading.set(false);
      },
      error: () => this.coLoading.set(false),
    });
    this.addLine();
  }

  selectCompany(co: CompanySummary): void {
    this.selectedCo.set(co);
    this.error.set('');
    this.saved.set(false);
    this.sent.set(false);
  }

  // ── Lignes ────────────────────────────────────────────
  addLine(): void {
    this.lines.push({ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 });
  }

  removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.splice(i, 1);
  }

  recalcLine(i: number): void {
    const l = this.lines[i];
    l.subTotal = +(l.quantity * l.unitPrice).toFixed(2);
  }

  // ── Enregistrer ───────────────────────────────────────
  private _buildPayload(): BillCreatePayload {
    const co = this.selectedCo()!;
    return {
      companyName:    co.companyName,
      companyCode:    co.companyId,
      period:         this.period,
      billedDate:     this.billedDate,
      companyPrice:   this.subtotal,
      numberOfVisits: this.numberOfVisits,
      totalBeforeTax: this.subtotal,
      tps:            this.tpsAmount,
      tvq:            this.tvqAmount,
      totalWithTax:   this.totalTtc,
      note:           this.note,
      lines:          this.lines,
    };
  }

  save(): void {
    if (!this.selectedCo()) { this.error.set('Sélectionnez une compagnie.'); return; }
    if (this.lines.every(l => !l.description.trim())) { this.error.set('Ajoutez au moins une ligne de description.'); return; }

    this.error.set('');
    this.saving.set(true);
    this.invoiceSvc.create(this._buildPayload()).subscribe({
      next: res => {
        this.log('✓ facture créée:', res);
        this.saved.set(true);
        this.saving.set(false);
        setTimeout(() => this.saved.set(false), 4000);
      },
      error: err => {
        this.warn('✕ create:', err);
        this.error.set(this.invoiceSvc.error() ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  // ── Enregistrer + marquer envoyée ────────────────────
  saveAndSend(): void {
    if (!this.selectedCo()) { this.error.set('Sélectionnez une compagnie.'); return; }
    if (this.lines.every(l => !l.description.trim())) { this.error.set('Ajoutez au moins une ligne de description.'); return; }

    this.error.set('');
    this.saving.set(true);
    this.invoiceSvc.create(this._buildPayload()).subscribe({
      next: res => {
        this.invoiceSvc.markSent(res.billIdentifier).subscribe({
          next: () => {
            this.sent.set(true);
            this.saving.set(false);
            this.log('✓ créée + envoyée:', res);
            setTimeout(() => this.sent.set(false), 4000);
          },
          error: err => {
            this.warn('✕ markSent:', err);
            this.saving.set(false);
            this.saved.set(true); // facture créée quand même
          },
        });
      },
      error: err => {
        this.error.set(this.invoiceSvc.error() ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  // ── Imprimer / PDF ────────────────────────────────────
  printPreview(): void { window.print(); }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
