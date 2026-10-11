import { todayIso } from '../../shared/dates';
import { Component, OnInit, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InvoiceService, BillSummary, BillDetail, BillLine, BillFilter, BillCreatePayload } from '../../../state/invoice/invoice.service';
import { ConfigService } from '../../../state/config/config.service';
import { TableSort, SortValue } from '../../shared/table-sort';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { ExportCell, ExportDoc, ExportRow, TableExportService } from '../../../state/export/table-export.service';

import { downloadBlob } from '../../shared/download';
import { httpErrorMessage } from '../../shared/http-error';
type BillSortKey = 'num' | 'company' | 'period' | 'date' | 'ttc' | 'sent' | 'paid';
const SORT_LABELS: Record<BillSortKey, string> = {
  num: 'N° facture', company: 'Compagnie', period: 'Période', date: 'Date', ttc: 'Total TTC', sent: 'Statut envoi', paid: 'Paiement',
};

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
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, ExportButtonsComponent],
    templateUrl: './invoice-manage.component.html',
    styleUrls: ['./invoice-manage.component.scss']
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

  private _unsortedRoots = computed(() =>
    [...this._nodeMap().values()].filter(n => !n.data.parentBillIdentifier)
  );

  /** Tri au clic sur l'en-tête, appliqué à toute la liste avant la pagination.
   *  Les avoirs restent sous leur facture d'origine. */
  readonly sort = new TableSort<BillSortKey>(['date', 'ttc']);

  rootNodes = computed(() =>
    this.sort.apply(this._unsortedRoots(), (n, k) => this._sortValue(n.data, k))
  );

  private _sortValue(b: BillSummary, k: BillSortKey): SortValue {
    switch (k) {
      case 'num':     return b.billNumber;
      case 'company': return b.companyName;
      case 'period':  return b.period;
      case 'date':    return b.billedDate;
      case 'ttc':     return b.totalWithTax;
      case 'sent':    return b.isSent;   // non envoyées d'abord au 1er clic
      case 'paid':    return b.isPaid;   // impayées d'abord au 1er clic
    }
  }

  /** Export : toutes les factures filtrées (toutes les pages), dans l'ordre du tri, avoirs sous leur facture. */
  exportBills = (): ExportDoc => {
    const rows: ExportRow[] = [];
    const line = (b: BillSummary): ExportCell[] => [
      b.billNumber, b.companyName, b.period, (b.billedDate ?? '').slice(0, 10),
      b.totalBeforeTax, b.tps, b.tvq, b.totalWithTax,
      b.isSent ? 'Envoyée' : 'Non envoyée', b.parentBillIdentifier !== null ? '' : b.isPaid ? 'Payée' : 'Impayée',
    ];
    const walk = (nodes: BillTreeNode[], depth: number) => {
      for (const n of nodes) {
        rows.push({ kind: depth > 0 ? 'detail' : undefined, cells: line(n.data) });
        walk(n.children, depth + 1);
      }
    };
    walk(this.rootNodes(), 0);
    const all = this.bills();
    const sum = (k: 'totalBeforeTax' | 'tps' | 'tvq' | 'totalWithTax') => Math.round(all.reduce((t, b) => t + b[k], 0) * 100) / 100;
    const nf = this.rootNodes().length, na = all.length - nf;
    rows.push({ kind: 'total', cells: [`Total : ${nf} facture(s), ${na} avoir(s)`, '', '', '', sum('totalBeforeTax'), sum('tps'), sum('tvq'), sum('totalWithTax'), '', ''] });
    return {
      fileName: TableExportService.fileName('Gestion_des_factures', this.dateFrom, this.dateTo),
      title: 'Gestion des factures',
      subtitle: this._filterLabel(),
      landscape: true,
      tables: [{
        title: 'Factures',
        columns: [
          { header: 'N° facture', width: 18 }, { header: 'Compagnie', width: 32 }, { header: 'Période', width: 10 }, { header: 'Date', width: 12 },
          { header: 'Total HT', type: 'money' }, { header: 'TPS', type: 'money' }, { header: 'TVQ', type: 'money' }, { header: 'Total TTC', type: 'money' },
          { header: 'Envoi', width: 13 }, { header: 'Paiement', width: 11 },
        ],
        rows,
      }],
    };
  };

  private _filterLabel(): string {
    const parts: string[] = [];
    if (this.search?.trim()) parts.push(`Recherche « ${this.search.trim()} »`);
    const st = [this.onlyNotSent && 'non envoyées', this.onlySent && 'envoyées', this.onlyPaid && 'payées', this.onlyUnpaid && 'impayées'].filter(Boolean);
    if (st.length) parts.push(`Statut : ${st.join(', ')}`);
    if (this.dateFrom || this.dateTo) parts.push(`Du ${this.dateFrom || '…'} au ${this.dateTo || '…'}`);
    const k = this.sort.key();
    if (k) parts.push(`Tri : ${SORT_LABELS[k]} ${this.sort.dir() === 'asc' ? 'croissant' : 'décroissant'}`);
    return parts.length ? parts.join(' — ') : 'Toutes les factures';
  }

  sortBy(k: BillSortKey): void {
    this.sort.toggle(k);
    this.currentPage.set(1);
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  pageSize    = signal(25);
  currentPage = signal(1);
  totalPages  = computed(() => Math.max(1, Math.ceil(this.rootNodes().length / this.pageSize())));

  paginatedRootNodes = computed(() => {
    const page = Math.min(this.currentPage(), this.totalPages());
    const size = this.pageSize();
    return this.rootNodes().slice((page - 1) * size, page * size);
  });

  trackByBillId(_: number, r: FlatRow): number { return r.node.data.billIdentifier; }

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

  private _tpsRate = 0.05;
  private _tvqRate = 0.09975;

  get aSubtotal(): number { return +this.aLines.reduce((s, l) => s + l.subTotal, 0).toFixed(2); }
  get aTps(): number      { return +(this.aSubtotal * this._tpsRate).toFixed(2); }
  get aTvq(): number      { return +(this.aSubtotal * this._tvqRate).toFixed(2); }
  get aTtc(): number      { return +(this.aSubtotal + this.aTps + this.aTvq).toFixed(2); }

  constructor(
    public  invoiceSvc: InvoiceService,
    private configSvc:  ConfigService,
    private router:     Router,
  ) {}

  ngOnInit(): void {
    this.loadBills();
    this.configSvc.get().subscribe({
      next: data => {
        if (data.config.tpsRate != null) this._tpsRate = data.config.tpsRate / 100;
        if (data.config.tvqRate != null) this._tvqRate = data.config.tvqRate / 100;
      },
    });
  }

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
      next: list => {
        const avoirs = list.filter(b => b.parentBillIdentifier !== null);
        console.log(`[loadBills] ${list.length} factures | ${avoirs.length} avoir(s)`, avoirs.map(a => a.billNumber));
      },
      error: err => this.error.set(httpErrorMessage(err)),
    });
  }

  // ── Notes actives liées à la facture ou à sa compagnie ─
  private readonly noteAlerts = inject(NoteAlertService);
  private alertNotes(bill: BillSummary, action: string): void {
    this.noteAlerts.check({ billIds: [bill.billId], companyIds: [bill.companyId] }, `${action} ${bill.billNumber}`);
  }

  // ── Détail (modal) ────────────────────────────────────
  openDetail(bill: BillSummary): void {
    this.alertNotes(bill, 'Ouverture de la facture');
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

  // ── Choix : mettre à jour le statut ou envoyer réellement ─────────────
  openSend(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.alertNotes(bill, 'Envoi de la facture');
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
        this.error.set(httpErrorMessage(err));
        this.acting.set(false);
      },
    });
  }

  goToRealSend(bill: BillSummary): void {
    this.closeModal();
    this.router.navigate(['/invoices/send'], { queryParams: { billId: bill.billIdentifier } });
  }

  // ── Supprimer ─────────────────────────────────────────
  openDelete(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.alertNotes(bill, 'Suppression de la facture');
    this.selectedBill.set(bill);
    this.modalMode.set('delete');
  }

  confirmDelete(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);

    const isAvoir = bill.parentBillIdentifier !== null;
    const obs = isAvoir
      ? this.invoiceSvc.deleteAvoir(bill.billIdentifier)
      : this.invoiceSvc.delete(bill.billIdentifier);

    obs.subscribe({
      next: () => {
        this.success.set(`${isAvoir ? 'Avoir' : 'Facture'} ${bill.billNumber} supprimé(e).`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(httpErrorMessage(err));
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
        this.error.set(httpErrorMessage(err));
        this.acting.set(false);
      },
    });
  }

  confirmDetailDelete(): void {
    const bill = this.selectedBill();
    if (!bill) return;
    this.acting.set(true);

    const isAvoir = bill.parentBillIdentifier !== null;
    const obs = isAvoir
      ? this.invoiceSvc.deleteAvoir(bill.billIdentifier)
      : this.invoiceSvc.delete(bill.billIdentifier);

    obs.subscribe({
      next: () => {
        this.success.set(`${isAvoir ? 'Avoir' : 'Facture'} ${bill.billNumber} supprimé(e).`);
        this.closeModal();
        this.loadBills();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(httpErrorMessage(err));
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
    this.alertNotes(bill, 'Création d\'un avoir');
    if (!bill.isSent) return;
    this.selectedBill.set(bill);
    this.aNote           = `AVOIR — Réf. ${bill.billNumber}`;
    this.aPeriod         = '';
    this.aBilledDate     = todayIso();
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
        // Auto-expanser le nœud parent pour que l'avoir soit visible immédiatement
        this.expandedIds.update(s => {
          const next = new Set(s);
          next.add(bill.billIdentifier);
          return next;
        });
        setTimeout(() => this.success.set(''), 4000);
      },
      error: err => {
        this.error.set(httpErrorMessage(err));
        this.acting.set(false);
      },
    });
  }

  // ── Marquer payée ─────────────────────────────────────
  togglePaid(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.alertNotes(bill, 'Paiement de la facture');
    this.invoiceSvc.markPaid(bill.billIdentifier, !bill.isPaid).subscribe({
      next: () => {
        bill.isPaid = !bill.isPaid;
        this.success.set(`Facture ${bill.billNumber} marquée ${bill.isPaid ? 'payée' : 'impayée'}.`);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: err => this.error.set(httpErrorMessage(err)),
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
        downloadBlob(blob, `${bill.billNumber}.pdf`);
      },
      error: () => this.error.set('Fichier introuvable sur le serveur.'),
    });
  }

  navigateEdit(bill: BillSummary): void {
    this.closeModal();
    this.router.navigate(['/invoices/new'], { queryParams: { edit: bill.billIdentifier } });
  }
}
