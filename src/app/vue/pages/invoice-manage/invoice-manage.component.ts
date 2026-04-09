import { Component, OnInit, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InvoiceService, BillSummary, BillDetail, BillLine, BillFilter, BillCreatePayload } from '../../../state/invoice/invoice.service';

type ModalMode = 'delete' | 'avoir' | 'detail' | 'send' | null;

interface BillTreeNode {
  data:     BillSummary;
  children: BillTreeNode[];
}

interface FlatRow {
  node:  BillTreeNode;
  depth: number;
}

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

  // ── Arborescence factures + avoirs ────────────────────────────────────────
  expandedIds = signal(new Set<number>());

  private _nodeMap = computed(() => {
    const map = new Map<number, BillTreeNode>();
    for (const b of this.bills()) {
      map.set(b.billIdentifier, { data: b, children: [] });
    }
    for (const node of map.values()) {
      const pid = node.data.parentBillIdentifier;
      if (pid !== null && pid !== undefined && map.has(pid)) {
        map.get(pid)!.children.push(node);
      }
    }
    return map;
  });

  rootNodes = computed(() =>
    [...this._nodeMap().values()].filter(n => !n.data.parentBillIdentifier)
  );

  // ── Pagination ────────────────────────────────────────────────────────────
  pageSize    = signal(25);
  currentPage = signal(1);
  totalPages  = computed(() => Math.max(1, Math.ceil(this.rootNodes().length / this.pageSize())));

  paginatedRootNodes = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    return this.rootNodes().slice((page - 1) * size, page * size);
  });

  flatRows = computed((): FlatRow[] => {
    const rows: FlatRow[] = [];
    const expanded = this.expandedIds();
    const push = (nodes: BillTreeNode[], depth: number) => {
      for (const n of nodes) {
        rows.push({ node: n, depth });
        if (n.children.length > 0 && expanded.has(n.data.billIdentifier)) {
          push(n.children, depth + 1);
        }
      }
    };
    push(this.paginatedRootNodes(), 0);
    return rows;
  });

  setPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  goToPage(p: number): void {
    const clamped = Math.max(1, Math.min(p, this.totalPages()));
    this.currentPage.set(clamped);
  }

  pageEnd(): number {
    return Math.min(this.currentPage() * this.pageSize(), this.rootNodes().length);
  }

  // Génère les numéros de pages à afficher avec ellipses (-1)
  pageRange(): number[] {
    const total = this.totalPages();
    const cur   = this.currentPage();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    if (cur > 3)          pages.push(-1);
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p);
    if (cur < total - 2)  pages.push(-1);
    pages.push(total);
    return pages;
  }

  toggleExpand(id: number, e: Event): void {
    e.stopPropagation();
    this.expandedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // IDs de toutes les factures qui ont au moins un avoir direct
  private _avoirParentIds = computed(() => {
    const set = new Set<number>();
    for (const b of this.bills()) {
      if (b.parentBillIdentifier != null) set.add(b.parentBillIdentifier);
    }
    return set;
  });

  // Vrai si la facture appartient à un arbre qui contient au moins un avoir
  isInAvoirTree(id: number, parentId: number | null): boolean {
    return parentId !== null || this._avoirParentIds().has(id);
  }

  // ── Filtres ───────────────────────────────────────────
  search      = '';
  onlyNotSent = true;
  onlySent    = true;
  onlyPaid    = true;
  onlyUnpaid  = true;
  dateFrom    = '';
  dateTo      = '';

  // ── Modal ─────────────────────────────────────────────
  modalMode     = signal<ModalMode>(null);
  selectedBill  = signal<BillSummary | null>(null);
  detailBill    = signal<BillDetail | null>(null);
  loadingDetail = signal(false);
  acting        = signal(false);
  uploadingFile  = signal(false);

  // Formulaire avoir
  aNote           = '';
  aPeriod         = '';
  aBilledDate     = '';
  aNumberOfVisits = 0;
  aPaymentInfo    = '';
  aLines: BillLine[] = [];

  get aSubtotal(): number { return this.aLines.reduce((s, l) => s + l.subTotal, 0); }
  get aTps(): number      { return +(this.aSubtotal * 0.05).toFixed(2); }
  get aTvq(): number      { return +(this.aSubtotal * 0.09975).toFixed(2); }
  get aTtc(): number      { return +(this.aSubtotal + this.aTps + this.aTvq).toFixed(2); }

  constructor(
    public  invoiceSvc: InvoiceService,
    private router:     Router,
  ) {}

  ngOnInit(): void { this.loadBills(); }

  // ── Chargement ────────────────────────────────────────
  loadBills(): void {
    this.error.set('');
    this.currentPage.set(1);

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
      next: d => {
        this.detailBill.set(d);
        this.loadingDetail.set(false);
      },
      error: () => this.loadingDetail.set(false),
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

  // ── Avoir ─────────────────────────────────────────────
  openAvoir(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    if (!bill.isSent) return;
    this.selectedBill.set(bill);
    this.aNote           = `AVOIR — Réf. ${bill.billNumber}`;
    this.aPeriod         = '';
    this.aBilledDate     = new Date().toISOString().split('T')[0];
    this.aNumberOfVisits = 0;
    this.aPaymentInfo    = '';
    this.loadingDetail.set(true);
    this.modalMode.set('avoir');
    this.invoiceSvc.getById(bill.billIdentifier).subscribe({
      next: d => {
        this.detailBill.set(d);
        this.aPeriod         = d.period;
        this.aNumberOfVisits = d.numberOfVisits;
        this.aPaymentInfo    = d.paymentInfo;
        this.aLines = d.lines.map(l => ({ ...l, id: crypto.randomUUID() }));
        if (this.aLines.length === 0)
          this.aLines = [{ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 }];
        this.loadingDetail.set(false);
      },
      error: () => {
        this.aLines = [{ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 }];
        this.loadingDetail.set(false);
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
      period:         this.aPeriod,
      billedDate:     this.aBilledDate,
      companyPrice:   this.aSubtotal,
      numberOfVisits: this.aNumberOfVisits,
      totalBeforeTax: this.aSubtotal,
      tps:            this.aTps,
      tvq:            this.aTvq,
      totalWithTax:   this.aTtc,
      note:           this.aNote,
      paymentInfo:    this.aPaymentInfo,
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

  // ── Upload fichier joint ──────────────────────────────
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const bill = this.detailBill();
    if (!file || !bill) return;

    this.uploadingFile.set(true);
    this.invoiceSvc.uploadFile(bill.billIdentifier, file).subscribe({
      next: res => {
        // Met à jour le filePath affiché sans recharger toute la liste
        const updated = { ...bill, filePath: res.fileName };
        this.detailBill.set(updated as any);
        this.success.set('Fichier joint avec succès.');
        this.uploadingFile.set(false);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur upload ${err.status}`);
        this.uploadingFile.set(false);
      },
    });
    input.value = '';
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.selectedBill.set(null);
    this.detailBill.set(null);
    this.acting.set(false);
    this.detailAction = null;
    this.detailTab    = 'detail';
    this.aNote           = '';
    this.aPeriod         = '';
    this.aBilledDate     = '';
    this.aNumberOfVisits = 0;
    this.aPaymentInfo    = '';
    this.aLines          = [];
  }

  // ── Tooltips ──────────────────────────────────────────
  private _fmtDate(iso: string): string {
    const d = new Date(iso);
    const jj = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const aa = d.getUTCFullYear();
    return `${jj}/${mm}/${aa}`;
  }

  sentTitle(b: BillSummary): string {
    if (b.sentDate) return `Envoyée le ${this._fmtDate(b.sentDate)}`;
    return '';
  }

  paidTitle(b: BillSummary): string {
    if (!b.isSent) return 'La facture doit être envoyée avant de pouvoir être marquée payée';
    if (b.isPaid && b.paidDate) return `Payée le ${this._fmtDate(b.paidDate)}`;
    return '';
  }

  navigateGenerate(): void { this.router.navigate(['/invoices/new']); }

  downloadPdf(bill: BillSummary): void {
    this.invoiceSvc.downloadFile(bill.billIdentifier).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href     = url;
        a.download = `${bill.billNumber}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set('Fichier introuvable sur le serveur.'),
    });
  }

  navigateEdit(bill: BillSummary): void {
    this.closeModal();
    this.router.navigate(['/invoices/new'], { queryParams: { edit: bill.billIdentifier } });
  }
}
