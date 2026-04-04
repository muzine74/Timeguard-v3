import { Component, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InvoiceService, BillSummary, BillDetail, BillLine, BillFilter, BillCreatePayload } from '../../../state/invoice/invoice.service';

type ModalMode = 'delete' | 'avoir' | 'detail' | 'send' | null;

@Component({
  selector: 'app-invoice-manage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-manage.component.html',
  styleUrls: ['./invoice-manage.component.scss'],
})
export class InvoiceManageComponent implements OnInit {

  // ── Liste — Perf #13 : signal du service (cache entre navigations) ──────
  bills    = this.invoiceSvc.list;
  loading  = this.invoiceSvc.loading;
  error    = signal('');
  success  = signal('');

  // ── Filtres ───────────────────────────────────────────
  search      = '';
  onlyNotSent = false;
  onlySent    = false;
  onlyPaid    = false;
  onlyUnpaid  = false;
  dateFrom    = '';
  dateTo      = '';

  // ── Modal ─────────────────────────────────────────────
  modalMode     = signal<ModalMode>(null);
  selectedBill  = signal<BillSummary | null>(null);
  detailBill    = signal<BillDetail | null>(null);
  loadingDetail = signal(false);
  acting        = signal(false);

  // Formulaire avoir
  aNote = '';
  aLines: BillLine[] = [];

  get aSubtotal(): number { return this.aLines.reduce((s, l) => s + l.subTotal, 0); }
  get aTps(): number      { return +(this.aSubtotal * 0.05).toFixed(2); }
  get aTvq(): number      { return +(this.aSubtotal * 0.09975).toFixed(2); }
  get aTtc(): number      { return +(this.aSubtotal + this.aTps + this.aTvq).toFixed(2); }

  constructor(private invoiceSvc: InvoiceService, private router: Router) {}

  ngOnInit(): void { this.loadBills(); }

  // ── Chargement ────────────────────────────────────────
  loadBills(): void {
    this.error.set('');

    const filter: BillFilter = {
      search:      this.search      || undefined,
      onlyNotSent: this.onlyNotSent || undefined,
      onlySent:    this.onlySent    || undefined,
      onlyPaid:    this.onlyPaid    || undefined,
      onlyUnpaid:  this.onlyUnpaid  || undefined,
      dateFrom:    this.dateFrom    || undefined,
      dateTo:      this.dateTo      || undefined,
    };

    this.invoiceSvc.getAll(filter).subscribe({
      next: ()   => {},   // bills + loading gérés dans InvoiceService
      error: err => this.error.set(`HTTP ${err.status}`),
    });
  }

  // ── Détail (modal) ────────────────────────────────────
  openDetail(bill: BillSummary): void {
    this.selectedBill.set(bill);
    this.modalMode.set('detail');
    this.loadingDetail.set(true);
    this.invoiceSvc.getById(bill.billIdentifier).subscribe({
      next: d    => { this.detailBill.set(d); this.loadingDetail.set(false); },
      error: ()  =>   this.loadingDetail.set(false),
    });
  }

  // ── Confirmer envoi ───────────────────────────────────
  openSend(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.selectedBill.set(bill);
    this.modalMode.set('send');
  }

  confirmSend(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);

    this.invoiceSvc.markSent(bill.billIdentifier).subscribe({
      next: () => {
        bill.isSent = true;
        this.success.set(`Facture ${bill.billNumber} marquée comme envoyée.`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.acting.set(false);
      },
    });
  }

  // ── Supprimer ─────────────────────────────────────────
  openDelete(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.selectedBill.set(bill);
    this.modalMode.set('delete');
  }

  confirmDelete(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);

    this.invoiceSvc.delete(bill.billIdentifier).subscribe({
      next: () => {
        this.success.set(`Facture ${bill.billNumber} supprimée.`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.acting.set(false);
      },
    });
  }

  // ── Confirmation inline dans le modal détail ─────────
  detailAction: 'send' | 'delete' | null = null;

  requestDetailSend(): void  { this.detailAction = 'send'; }
  requestDetailDelete(): void { this.detailAction = 'delete'; }
  cancelDetailAction(): void  { this.detailAction = null; }

  confirmDetailSend(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);
    this.invoiceSvc.markSent(bill.billIdentifier).subscribe({
      next: () => {
        bill.isSent = true;
        this.success.set(`Facture ${bill.billNumber} marquée comme envoyée.`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.acting.set(false);
      },
    });
  }

  confirmDetailDelete(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);
    this.invoiceSvc.delete(bill.billIdentifier).subscribe({
      next: () => {
        this.success.set(`Facture ${bill.billNumber} supprimée.`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.acting.set(false);
      },
    });
  }

  // ── Onglet dans le modal détail ───────────────────────
  detailTab: 'detail' | 'avoir' = 'detail';

  switchTab(tab: 'detail' | 'avoir'): void {
    this.detailTab = tab;
    if (tab === 'avoir' && this.detailBill()) {
      // Pré-remplir les lignes depuis le détail déjà chargé
      this.aNote  = '';
      this.aLines = (this.detailBill()!.lines ?? []).map(l => ({ ...l, id: crypto.randomUUID() }));
      if (this.aLines.length === 0)
        this.aLines = [{ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 }];
    }
  }

  // ── Avoir (depuis modal externe — conservé pour compat) ──
  openAvoir(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.selectedBill.set(bill);
    this.aNote  = '';
    this.loadingDetail.set(true);
    this.invoiceSvc.getById(bill.billIdentifier).subscribe({
      next: d => {
        this.detailBill.set(d);
        this.aLines = d.lines.map(l => ({ ...l, id: crypto.randomUUID() }));
        if (this.aLines.length === 0)
          this.aLines = [{ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 }];
        this.loadingDetail.set(false);
        this.detailTab = 'avoir';
        this.modalMode.set('detail');
      },
      error: () => {
        this.aLines = [{ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 }];
        this.loadingDetail.set(false);
        this.detailTab = 'avoir';
        this.modalMode.set('detail');
      },
    });
  }

  addALine(): void {
    this.aLines.push({ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 });
  }
  removeALine(i: number): void { if (this.aLines.length > 1) this.aLines.splice(i, 1); }
  recalcALine(i: number): void {
    const l = this.aLines[i];
    l.subTotal = +(l.quantity * l.unitPrice).toFixed(2);
  }

  confirmAvoir(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);

    const payload: BillCreatePayload = {
      companyName:    bill.companyName,
      companyCode:    bill.companyCode,
      period:         bill.period,
      billedDate:     new Date().toISOString().split('T')[0],
      companyPrice:   this.aSubtotal,
      numberOfVisits: 0,
      totalBeforeTax: this.aSubtotal,
      tps:            this.aTps,
      tvq:            this.aTvq,
      totalWithTax:   this.aTtc,
      note:           this.aNote,
      lines:          this.aLines,
    };

    this.invoiceSvc.createAvoir(bill.billIdentifier, payload).subscribe({
      next: res => {
        this.success.set(`Avoir ${res.billNumber} créé avec succès.`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.acting.set(false);
      },
    });
  }

  // ── Marquer payée ─────────────────────────────────────
  togglePaid(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.invoiceSvc.markPaid(bill.billIdentifier, !bill.isPaid).subscribe({
      next: () => {
        bill.isPaid = !bill.isPaid;
        this.success.set(`Facture ${bill.billNumber} marquée ${bill.isPaid ? 'payée' : 'impayée'}.`);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: err => this.error.set(err?.error?.message ?? `HTTP ${err.status}`),
    });
  }

  closeModal(): void { this.modalMode.set(null); this.selectedBill.set(null); this.detailBill.set(null); this.acting.set(false); this.detailAction = null; this.detailTab = 'detail'; }

  navigateGenerate(): void { this.router.navigate(['/invoices/new']); }
}
