import { todayIso } from '../../shared/dates';
import { Component, OnInit, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { InvoiceService, BillSummary, BillDetail, BillLine, BillFilter, BillCreatePayload } from '../../../state/invoice/invoice.service';
import { ConfigService } from '../../../state/config/config.service';
import { AuthService } from '../../../state/auth/auth.service';
import { BankTransactionsService, BillBankLinks, BillBankCandidate, BankTransactionRef, txRef } from '../../../state/bank/bank-transactions.service';
import { TableSort, SortValue } from '../../shared/table-sort';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { ExportCell, ExportDoc, ExportRow, TableExportService } from '../../../state/export/table-export.service';

import { downloadBlob } from '../../shared/download';
import { httpErrorMessage } from '../../shared/http-error';
import { SearchHintComponent } from '../../components/search-hint/search-hint.component';
import { searchTerms, matchesAll, kw, searchLabel, SearchQuery } from '../../shared/multi-search';
type BillSortKey = 'num' | 'company' | 'period' | 'date' | 'ttc' | 'sent' | 'paid';
const SORT_LABELS: Record<BillSortKey, string> = {
  num: 'N° facture', company: 'Compagnie', period: 'Période', date: 'Date', ttc: 'Total TTC', sent: 'Statut envoi', paid: 'Paiement',
};

type ModalMode = 'delete' | 'avoir' | 'detail' | 'send' | 'pay' | null;

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
    imports: [CommonModule, FormsModule, ExportButtonsComponent, SearchHintComponent],
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

  /**
   * Recherche multicritères (« & » = ET, « | » = OU), faite ici sur la liste chargée : une facture est
   * gardée si elle ou l'un de ses avoirs correspond ; ses avoirs restent affichés sous elle.
   */
  private _unsortedRoots = computed(() => {
    const terms = searchTerms(this.search());
    const roots = [...this._nodeMap().values()].filter(n => !n.data.parentBillIdentifier);
    if (!terms.length) return roots;
    const hit = (n: BillTreeNode): boolean => this._matches(terms, n.data) || n.children.some(hit);
    return roots.filter(hit);
  });

  private _matches(terms: SearchQuery, b: BillSummary): boolean {
    const money = (v: number) => [v.toFixed(2), v.toFixed(2).replace('.', ',')];
    return matchesAll(terms, b.billNumber, b.companyName, b.companyCode, b.period, (b.billedDate ?? '').slice(0, 10), b.note,
      money(b.totalBeforeTax), money(b.totalWithTax),
      kw(b.isSent ? 'envoyée' : 'non envoyée'), b.parentBillIdentifier !== null ? kw('avoir') : kw(b.isPaid ? 'payée' : 'impayée'));
  }

  /** Factures et avoirs affichés (après recherche), pour les compteurs et les totaux de l'export. */
  shownBills = computed(() => {
    const out: BillSummary[] = [];
    const walk = (n: BillTreeNode) => { out.push(n.data); n.children.forEach(walk); };
    this._unsortedRoots().forEach(walk);
    return out;
  });

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
    const all = this.shownBills();
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
    if (searchLabel(this.search())) parts.push(searchLabel(this.search()));
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
  /** Recherche locale (signal : lue par les computed de l'arborescence). */
  search      = signal('');
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
  // Un avoir reprend les taux figés sur la facture d'origine (configuration actuelle seulement à défaut)
  private get _aTpsRate(): number { const r = this.detailBill()?.tpsRate; return r ? r / 100 : this._tpsRate; }
  private get _aTvqRate(): number { const r = this.detailBill()?.tvqRate; return r ? r / 100 : this._tvqRate; }
  get aTps(): number      { return +(this.aSubtotal * this._aTpsRate).toFixed(2); }
  get aTvq(): number      { return +(this.aSubtotal * this._aTvqRate).toFixed(2); }

  /** Libellé « TPS (5 %) » d'après un taux en fraction (0.05). */
  rateLabel(name: 'TPS' | 'TVQ', rate: number): string {
    return `${name} (${String(+(rate * 100).toFixed(4)).replace('.', ',')} %)`;
  }
  get aTpsLabel(): string { return this.rateLabel('TPS', this._aTpsRate); }
  get aTvqLabel(): string { return this.rateLabel('TVQ', this._aTvqRate); }
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
  // ── Paiement : payée / non payée, date, transaction bancaire ─────────────
  private readonly auth    = inject(AuthService);
  private readonly bankSvc = inject(BankTransactionsService);
  /** Lier au relevé : droit « paiements » (relevé bancaire). */
  readonly canBank = this.auth.hasPerm('payments.manage');
  readonly txRef = txRef;
  readonly todayIso = todayIso;
  payDate     = signal(todayIso());
  payError    = signal('');
  bankLinks   = signal<BillBankLinks | null>(null);
  bankLoading = signal(false);
  bankSearch  = signal('');
  bankFrom    = signal('');   // période des dépôts proposés (par défaut : le mois précédent)
  bankTo      = signal('');
  private _bankTimer?: ReturnType<typeof setTimeout>;

  /** Facture affichée dans la fenêtre « Paiement » (toujours la version à jour de la liste). */
  readonly payBill = computed(() => {
    const s = this.selectedBill();
    return s ? this.bills().find(b => b.billIdentifier === s.billIdentifier) ?? s : null;
  });

  openPay(bill: BillSummary, e: Event): void {
    e.stopPropagation();
    this.alertNotes(bill, 'Paiement de la facture');
    this.selectedBill.set(bill);
    this.payDate.set(bill.paidDate ? bill.paidDate.slice(0, 10) : todayIso());
    this.payError.set('');
    this.bankLinks.set(null);
    this.bankSearch.set('');
    const [from, to] = this._previousMonth();
    this.bankFrom.set(from);
    this.bankTo.set(to);
    this.modalMode.set('pay');
    this._loadBank();
  }

  private _loadBank(): void {
    const b = this.selectedBill();
    if (!b || !this.canBank || b.parentBillIdentifier !== null) return;
    if (this.bankFrom() && this.bankTo() && this.bankFrom() > this.bankTo()) { this.payError.set('La date de début doit être avant la date de fin.'); return; }
    this.payError.set('');
    this.bankLoading.set(true);
    this.bankSvc.forBill(b.billIdentifier, this.bankSearch().trim(), this.bankFrom(), this.bankTo()).subscribe({
      next:  l   => { this.bankLinks.set(l); this.bankLoading.set(false); },
      error: err => { this.payError.set(httpErrorMessage(err, `Impossible de charger les transactions bancaires`)); this.bankLoading.set(false); },
    });
  }

  /** Premier et dernier jour du mois précédent (yyyy-MM-dd). */
  private _previousMonth(): [string, string] {
    const [y, m] = todayIso().split('-').map(Number);
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
    const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
    const mm = String(pm).padStart(2, '0');
    return [`${py}-${mm}-01`, `${py}-${mm}-${String(last).padStart(2, '0')}`];
  }

  setBankPeriod(which: 'from' | 'to', v: string): void {
    (which === 'from' ? this.bankFrom : this.bankTo).set(v ?? '');
    this._loadBank();
  }
  clearBankPeriod(): void { this.bankFrom.set(''); this.bankTo.set(''); this._loadBank(); }

  setBankSearch(q: string): void {
    this.bankSearch.set(q);
    clearTimeout(this._bankTimer);
    this._bankTimer = setTimeout(() => this._loadBank(), 300);
  }

  /** Marque payée (à la date saisie) ou non payée. */
  setPaid(isPaid: boolean): void {
    const b = this.payBill();
    if (!b || this.acting()) return;
    if (isPaid && !this.payDate()) { this.payError.set('Indiquez la date du paiement.'); return; }
    if (isPaid && this.payDate() > todayIso()) { this.payError.set('La date de paiement ne peut pas être dans le futur.'); return; }
    this.acting.set(true);
    this.payError.set('');
    this.invoiceSvc.markPaid(b.billIdentifier, isPaid, isPaid ? this.payDate() : undefined).subscribe({
      next: () => {
        this.acting.set(false);
        this.success.set(`Facture ${b.billNumber} marquée ${isPaid ? 'payée' : 'impayée'}.`);
        setTimeout(() => this.success.set(''), 3000);
      },
      error: err => { this.acting.set(false); this.payError.set(httpErrorMessage(err, `Le paiement n'a pas été enregistré`)); },
    });
  }

  /** Associe la facture à un dépôt du relevé : payée, à la date du dépôt (même si elle était déjà payée). */
  linkTx(c: BillBankCandidate): void {
    const b = this.payBill();
    if (!b || this.acting()) return;
    this.acting.set(true);
    this.payError.set('');
    this.bankSvc.addMatch(c.bankTransactionId, { targetType: 'bill', billIdentifier: b.billIdentifier, targetId: null }).subscribe({
      next: () => {
        this.invoiceSvc.patchLocal(b.billIdentifier, { isPaid: true, paidDate: c.date });
        this.acting.set(false);
        this._loadBank();
      },
      error: err => { this.acting.set(false); this.payError.set(httpErrorMessage(err, `L'association n'a pas été enregistrée`)); },
    });
  }

  /** Retire le lien : la facture redevient non payée si c'est ce lien qui l'avait marquée payée. */
  unlinkTx(): void {
    const b = this.payBill();
    const l = this.bankLinks();
    if (!b || !l?.linked || !l.matchId || this.acting()) return;
    this.acting.set(true);
    this.payError.set('');
    this.bankSvc.removeMatch(l.linked.bankTransactionId, l.matchId).subscribe({
      next: () => {
        // Statut à jour depuis le serveur (le lien n'avait peut-être pas marqué la facture payée)
        this.invoiceSvc.getById(b.billIdentifier).subscribe({
          next: d => this.invoiceSvc.patchLocal(b.billIdentifier, { isPaid: d.isPaid, paidDate: d.paidDate }),
        });
        this.acting.set(false);
        this._loadBank();
      },
      error: err => { this.acting.set(false); this.payError.set(httpErrorMessage(err, `Le lien n'a pas été retiré`)); },
    });
  }

  txLabel(t: BankTransactionRef): string { return `${t.date} · ${txRef(t)} · ${t.description}`; }
  fmtDay(iso: string | null | undefined): string { return iso ? this._fmtDate(iso) : ''; }

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
    clearTimeout(this._bankTimer);
    this.payError.set('');
    this.bankLinks.set(null);
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
