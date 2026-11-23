import { todayIso } from '../../shared/dates';
import {
  Component, ChangeDetectionStrategy, signal, computed, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { InvoiceService, BillSummary } from '../../../state/invoice/invoice.service';
import { ExportDoc, TableExportService } from '../../../state/export/table-export.service';

import { downloadBlob } from '../../shared/download';
import { httpErrorMessage } from '../../shared/http-error';
import { SearchHintComponent } from '../../components/search-hint/search-hint.component';
import { multiMatch, kw } from '../../shared/multi-search';
type FilterMode = 'date' | 'period';
type ExportType = 'summary' | 'merged' | 'zip' | 'excel' | 'csv';

/** Colonnes du tableau à l'écran. */
type ColKey = 'number' | 'company' | 'period' | 'sentDate' | 'paidDate' | 'ht' | 'tps' | 'tvq' | 'ttc';
interface ReportCol { key: ColKey; label: string; num: boolean }
const COLUMNS: ReportCol[] = [
  { key: 'number',   label: 'N° Facture',       num: false },
  { key: 'company',  label: 'Compagnie',        num: false },
  { key: 'period',   label: 'Période',          num: false },
  { key: 'sentDate', label: "Date d'envoi",     num: false },
  { key: 'paidDate', label: 'Date de paiement', num: false },
  { key: 'ht',       label: 'Montant HT',       num: true },
  { key: 'tps',      label: 'TPS',              num: true },
  { key: 'tvq',      label: 'TVQ',              num: true },
  { key: 'ttc',      label: 'Total TTC',        num: true },
];

/** Colonnes du PDF récapitulatif (clés comprises par l'API) ; par défaut, celles du PDF d'avant. */
type PrintKey = 'number' | 'company' | 'period' | 'date' | 'sentDate' | 'paidDate' | 'ht' | 'tps' | 'tvq' | 'ttc';
const PRINT_COLUMNS: { key: PrintKey; label: string }[] = [
  { key: 'number',   label: 'N° Facture' },
  { key: 'company',  label: 'Compagnie' },
  { key: 'period',   label: 'Période' },
  { key: 'date',     label: 'Date de la facture' },
  { key: 'sentDate', label: "Date d'envoi" },
  { key: 'paidDate', label: 'Date de paiement' },
  { key: 'ht',       label: 'Montant HT' },
  { key: 'tps',      label: 'TPS' },
  { key: 'tvq',      label: 'TVQ' },
  { key: 'ttc',      label: 'Total TTC' },
];
const DEFAULT_PRINT: PrintKey[] = ['number', 'company', 'period', 'date', 'ht', 'tps', 'tvq', 'ttc'];

/** Libellé d'une cellule vide dans la liste des valeurs (dates non renseignées). */
const EMPTY_VALUE = '(vide)';
type SortDir = 'asc' | 'desc';

const VIEW_STORE  = 'tg.invoiceReport.columns';
const PRINT_STORE = 'tg.invoiceReport.printColumns';

/** Choix mémorisé dans ce navigateur (clés inconnues ignorées) ; absent ou illisible = valeur par défaut. */
function readKeys<K extends string>(store: string, allowed: readonly K[], fallback: readonly K[]): Set<K> {
  try {
    const raw = JSON.parse(localStorage.getItem(store) ?? 'null');
    if (Array.isArray(raw)) {
      const keys = raw.filter((k): k is K => allowed.includes(k));
      if (keys.length) return new Set(keys);
    }
  } catch { /* stockage indisponible ou illisible */ }
  return new Set(fallback);
}
function writeKeys(store: string, keys: Set<string>): void {
  try { localStorage.setItem(store, JSON.stringify([...keys])); } catch { /* stockage indisponible */ }
}

@Component({
    selector: 'app-invoice-report',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, SearchHintComponent],
    templateUrl: './invoice-report.component.html',
    styleUrls: ['./invoice-report.component.scss']
})
export class InvoiceReportComponent {

  // ── Filtres ───────────────────────────────────────────────────────────
  filterMode  = signal<FilterMode>('date');
  dateFrom    = todayIso();
  dateTo      = todayIso();

  periodInput = '';
  periods     = signal<string[]>([]);

  selectedCompanies = signal<Set<string>>(new Set());
  companySearch     = '';
  companyPopupOpen  = signal(false);

  // ── Données — signal LOCAL, n'affecte pas les autres pages ───────────
  private _allBills = signal<BillSummary[]>([]);
  loading = signal(false);
  error   = signal('');
  success = signal('');

  // Compagnies disponibles dans les factures chargées
  availableCompanies = computed(() => {
    const names = new Set(this._allBills().map(b => b.companyName).filter(Boolean));
    return [...names].sort();
  });

  // Factures filtrées côté client (périodes + compagnies)
  baseBills = computed(() => {
    let bills = this._allBills();

    const periods = this.periods();
    if (periods.length > 0)
      bills = bills.filter(b => periods.includes(b.period));

    const sel = this.selectedCompanies();
    bills = bills.filter(b => sel.has(b.companyName));

    return bills;
  });

  // ── Colonnes : affichage, filtres d'en-tête, impression ──────────────
  readonly columns = COLUMNS;
  readonly printColumnList = PRINT_COLUMNS;
  visibleCols = signal<Set<ColKey>>(readKeys(VIEW_STORE, COLUMNS.map(c => c.key), COLUMNS.map(c => c.key)));
  printCols   = signal<Set<PrintKey>>(readKeys(PRINT_STORE, PRINT_COLUMNS.map(c => c.key), DEFAULT_PRINT));
  shownColumns = computed(() => COLUMNS.filter(c => this.visibleCols().has(c.key)));
  /** Colonnes texte affichées avant les montants : la ligne des totaux les couvre avec la case à cocher. */
  totalsLabelSpan = computed(() => 1 + this.shownColumns().filter(c => !c.num).length);
  shownMoney = computed(() => this.shownColumns().filter(c => c.num));
  colPopup = signal<'view' | 'print' | null>(null);

  /** Filtre saisi sous chaque en-tête (« & » = ET, « | » = OU, comme les autres recherches). */
  colFilters = signal<Partial<Record<ColKey, string>>>({});
  /** Valeurs décochées dans la liste de chaque colonne (une valeur nouvelle reste donc affichée). */
  valueExcluded = signal<Partial<Record<ColKey, Set<string>>>>({});
  hasColFilters = computed(() =>
    Object.values(this.colFilters()).some(v => !!v?.trim()) || Object.values(this.valueExcluded()).some(s => !!s?.size));

  /** Tri par clic sur l'en-tête : croissant, puis décroissant, puis ordre d'origine. */
  sortKey = signal<ColKey | null>(null);
  sortDir = signal<SortDir>('asc');

  /** Liste des valeurs ouverte (colonne) et recherche dans cette liste. */
  valuePopup = signal<ColKey | null>(null);
  valueSearch = '';

  // Factures affichées : filtres du haut + filtres des colonnes affichées, puis tri
  displayedBills = computed(() => {
    const filters = this.colFilters();
    const excluded = this.valueExcluded();
    const active = this.shownColumns().filter(c => filters[c.key]?.trim());
    const valued = this.shownColumns().filter(c => excluded[c.key]?.size);
    let bills = this.baseBills();
    if (active.length || valued.length)
      bills = bills.filter(b =>
        active.every(c => multiMatch(filters[c.key], ...this._cellSearch(b, c.key))) &&
        valued.every(c => !excluded[c.key]!.has(this.cellText(b, c.key))));
    const key = this.sortKey();
    if (!key || !this.visibleCols().has(key)) return bills;
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    return [...bills].sort((a, b) => dir * this._compare(a, b, key));
  });

  // ── Compagnies popup ──────────────────────────────────────────────────
  allCompaniesSelected = computed(() => {
    const list = this.availableCompanies();
    const sel  = this.selectedCompanies();
    return list.length > 0 && list.every(n => sel.has(n));
  });

  someCompaniesSelected = computed(() =>
    this.selectedCompanies().size > 0 && !this.allCompaniesSelected()
  );

  // ── Sélection de factures ─────────────────────────────────────────────
  selectedIds = signal(new Set<number>());

  allSelected = computed(() => {
    const bs  = this.displayedBills();
    const sel = this.selectedIds();
    return bs.length > 0 && bs.every(b => sel.has(b.billIdentifier));
  });

  /** Factures cochées ET visibles (un filtre de colonne peut en cacher) : ce sont elles qu'on totalise et exporte. */
  someSelected  = computed(() => this.selectedList().length > 0);

  selectedList  = computed(() =>
    this.displayedBills().filter(b => this.selectedIds().has(b.billIdentifier))
  );

  totals = computed(() => {
    const sel = this.selectedList();
    return {
      ht:  sel.reduce((s, b) => s + +b.totalBeforeTax, 0),
      tps: sel.reduce((s, b) => s + +b.tps, 0),
      tvq: sel.reduce((s, b) => s + +b.tvq, 0),
      ttc: sel.reduce((s, b) => s + +b.totalWithTax, 0),
    };
  });

  // ── Export ────────────────────────────────────────────────────────────
  exporting  = signal(false);
  exportOpen = signal(false);

  constructor(private invoiceSvc: InvoiceService, private tableExport: TableExportService) {}

  // ── Actions filtre ────────────────────────────────────────────────────

  setFilterMode(mode: FilterMode): void {
    this.filterMode.set(mode);
    this.error.set('');
  }

  addPeriod(): void {
    const v = this.periodInput.trim();
    if (!v || this.periods().includes(v)) { this.periodInput = ''; return; }
    this.periods.update(ps => [...ps, v]);
    this.periodInput = '';
  }

  removePeriod(p: string): void {
    this.periods.update(ps => ps.filter(x => x !== p));
  }

  applyFilter(): void {
    // Auto-ajouter la saisie en cours si non vide
    if (this.filterMode() === 'period' && this.periodInput.trim())
      this.addPeriod();

    const mode = this.filterMode();

    if (mode === 'period' && this.periods().length === 0) {
      this.error.set('Saisissez au moins une période (ex. 2026-06).');
      return;
    }

    this.error.set('');
    this.success.set('');
    this.selectedIds.set(new Set());
    this.selectedCompanies.set(new Set());
    this._allBills.set([]);
    this.loading.set(true);

    // Appel API : uniquement le filtre de dates (les périodes sont filtrées côté client)
    const dateFrom = mode === 'date' && this.dateFrom
      ? new Date(this.dateFrom).toISOString() : undefined;
    const dateTo   = mode === 'date' && this.dateTo
      ? new Date(this.dateTo).toISOString()   : undefined;

    this.invoiceSvc.fetchReport(dateFrom, dateTo).subscribe({
      next: list => {
        this._allBills.set(list);
        const allNames = new Set<string>(list.map((b: BillSummary) => b.companyName).filter(Boolean));
        this.selectedCompanies.set(allNames);
        this.loading.set(false);
      },
      error: e => {
        this.error.set(httpErrorMessage(e, `Erreur chargement`));
        this.loading.set(false);
      },
    });
  }

  // ── Actions compagnies ────────────────────────────────────────────────

  toggleCompany(name: string): void {
    this.selectedCompanies.update(s => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  isCompanySelected(name: string): boolean {
    return this.selectedCompanies().has(name);
  }

  toggleAllCompanies(): void {
    if (this.allCompaniesSelected())
      this.selectedCompanies.set(new Set());
    else
      this.selectedCompanies.set(new Set(this.availableCompanies()));
  }

  openCompanyPopup(e: MouseEvent): void {
    e.stopPropagation();
    this.companySearch = '';
    this.companyPopupOpen.set(true);
  }

  closeCompanyPopup(): void { this.companyPopupOpen.set(false); }

  get filteredCompanies(): string[] {
    // Critères « & » (ET) / « | » (OU) : nom, « sélectionnée » / « non sélectionnée »
    return this.availableCompanies().filter(n =>
      multiMatch(this.companySearch, n, kw(this.isCompanySelected(n) ? 'sélectionnée' : 'non sélectionnée')));
  }

  // ── Actions tableau ───────────────────────────────────────────────────

  toggleSelectAll(): void {
    if (this.allSelected())
      this.selectedIds.set(new Set());
    else
      this.selectedIds.set(new Set(this.displayedBills().map(b => b.billIdentifier)));
  }

  toggleSelect(id: number): void {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  isSelected(id: number): boolean { return this.selectedIds().has(id); }

  // ── Actions colonnes ──────────────────────────────────────────────────

  setColFilter(key: ColKey, value: string): void {
    this.colFilters.update(f => ({ ...f, [key]: value }));
  }

  clearColFilters(): void { this.colFilters.set({}); this.valueExcluded.set({}); }

  /** Filtres de colonnes en vigueur (colonnes affichées seulement : ce sont les seuls appliqués), pour les rendre visibles. */
  activeFilters = computed(() => {
    const text = this.colFilters();
    const excluded = this.valueExcluded();
    const out: { key: ColKey; kind: 'text' | 'values'; label: string; detail: string }[] = [];
    for (const c of this.shownColumns()) {
      const t = text[c.key]?.trim();
      if (t) out.push({ key: c.key, kind: 'text', label: c.label, detail: `« ${t} »` });
      const ex = excluded[c.key];
      if (ex?.size) {
        const names = [...ex];
        out.push({ key: c.key, kind: 'values', label: c.label,
                   detail: names.length <= 3 ? `sans ${names.join(', ')}` : `${names.length} valeur(s) masquée(s)` });
      }
    }
    return out;
  });

  /** Colonne avec au moins un filtre en vigueur (en-tête mis en évidence). */
  isColFiltered(key: ColKey): boolean {
    return !!this.colFilters()[key]?.trim() || this.hasValueFilter(key);
  }

  sortLabel = computed(() => {
    const key = this.sortKey();
    const col = key && this.visibleCols().has(key) ? COLUMNS.find(c => c.key === key) : null;
    return col ? `${col.label} ${this.sortDir() === 'asc' ? '▲' : '▼'}` : '';
  });

  removeFilter(f: { key: ColKey; kind: 'text' | 'values' }): void {
    if (f.kind === 'text') this.colFilters.update(m => ({ ...m, [f.key]: '' }));
    else this.valueExcluded.update(m => ({ ...m, [f.key]: new Set<string>() }));
  }

  clearSort(): void { this.sortKey.set(null); }

  /** Clic sur un en-tête : croissant → décroissant → sans tri. */
  toggleSort(key: ColKey): void {
    if (this.sortKey() !== key) { this.sortKey.set(key); this.sortDir.set('asc'); }
    else if (this.sortDir() === 'asc') this.sortDir.set('desc');
    else this.sortKey.set(null);
  }

  sortState(key: ColKey): 'ascending' | 'descending' | 'none' {
    return this.sortKey() !== key ? 'none' : this.sortDir() === 'asc' ? 'ascending' : 'descending';
  }

  // ── Liste des valeurs d'une colonne (cases à cocher) ──────────────────

  openValuePopup(key: ColKey, e: MouseEvent): void {
    e.stopPropagation();
    this.exportOpen.set(false);
    this.valueSearch = '';
    this.valuePopup.set(key);
  }

  closeValuePopup(): void { this.valuePopup.set(null); }

  valuePopupLabel = computed(() => COLUMNS.find(c => c.key === this.valuePopup())?.label ?? '');

  /** Valeurs distinctes de la colonne parmi les factures chargées (filtres du haut), triées comme la colonne. */
  columnValues = computed(() => {
    const key = this.valuePopup();
    if (!key) return [] as string[];
    const seen = new Map<string, BillSummary>();
    for (const b of this.baseBills()) { const t = this.cellText(b, key); if (!seen.has(t)) seen.set(t, b); }
    return [...seen.entries()].sort((x, y) => this._compare(x[1], y[1], key)).map(e => e[0]);
  });

  get filteredValues(): string[] {
    return this.columnValues().filter(v => multiMatch(this.valueSearch, v));
  }

  isValueShown(key: ColKey, value: string): boolean { return !this.valueExcluded()[key]?.has(value); }

  hasValueFilter(key: ColKey): boolean { return !!this.valueExcluded()[key]?.size; }

  toggleValue(key: ColKey, value: string): void {
    this.valueExcluded.update(m => {
      const next = new Set(m[key] ?? []);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { ...m, [key]: next };
    });
  }

  /** « Tout » coché si toutes les valeurs visibles dans la recherche sont affichées. */
  allValuesShown(): boolean {
    const key = this.valuePopup();
    return !!key && this.filteredValues.every(v => this.isValueShown(key, v));
  }

  /** Tout cocher / tout décocher (les valeurs visibles dans la recherche). */
  toggleAllValues(): void {
    const key = this.valuePopup();
    if (!key) return;
    const list = this.filteredValues;
    const show = !list.every(v => this.isValueShown(key, v));
    this.valueExcluded.update(m => {
      const next = new Set(m[key] ?? []);
      for (const v of list) { if (show) next.delete(v); else next.add(v); }
      return { ...m, [key]: next };
    });
  }

  /** Texte d'une cellule tel qu'affiché (sert à la liste des valeurs). */
  cellText(b: BillSummary, key: ColKey): string {
    const money = (v: number) => (+v).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
    switch (key) {
      case 'number':   return b.billNumber;
      case 'company':  return b.companyName;
      case 'period':   return b.period;
      case 'sentDate': return this.sentLabel(b) || EMPTY_VALUE;
      case 'paidDate': return this.paidLabel(b) || EMPTY_VALUE;
      case 'ht':       return money(b.totalBeforeTax);
      case 'tps':      return money(b.tps);
      case 'tvq':      return money(b.tvq);
      case 'ttc':      return money(b.totalWithTax);
    }
  }

  /** Comparaison pour le tri : montants en nombre, dates vides en dernier, textes « naturels » (F_2 avant F_10). */
  private _compare(a: BillSummary, b: BillSummary, key: ColKey): number {
    switch (key) {
      case 'ht':  return +a.totalBeforeTax - +b.totalBeforeTax;
      case 'tps': return +a.tps - +b.tps;
      case 'tvq': return +a.tvq - +b.tvq;
      case 'ttc': return +a.totalWithTax - +b.totalWithTax;
      case 'sentDate':
      case 'paidDate': {
        const x = key === 'sentDate' ? this.sentLabel(a) : this.paidLabel(a);
        const y = key === 'sentDate' ? this.sentLabel(b) : this.paidLabel(b);
        return x === y ? 0 : !x ? 1 : !y ? -1 : x < y ? -1 : 1;
      }
      default: {
        const x = key === 'number' ? a.billNumber : key === 'company' ? a.companyName : a.period;
        const y = key === 'number' ? b.billNumber : key === 'company' ? b.companyName : b.period;
        return (x ?? '').localeCompare(y ?? '', 'fr', { numeric: true, sensitivity: 'base' });
      }
    }
  }

  openColPopup(mode: 'view' | 'print', e: MouseEvent): void {
    e.stopPropagation();
    this.exportOpen.set(false);
    this.colPopup.set(mode);
  }

  closeColPopup(): void { this.colPopup.set(null); }

  /** Affiche / masque une colonne ; au moins une reste affichée. Le filtre d'une colonne masquée ne s'applique plus. */
  toggleViewCol(key: ColKey): void {
    const next = new Set(this.visibleCols());
    if (next.has(key)) { if (next.size === 1) return; next.delete(key); } else next.add(key);
    this.visibleCols.set(next);
    writeKeys(VIEW_STORE, next);
  }

  /** Colonne imprimée ou non dans le PDF récapitulatif ; au moins une reste cochée. */
  togglePrintCol(key: PrintKey): void {
    const next = new Set(this.printCols());
    if (next.has(key)) { if (next.size === 1) return; next.delete(key); } else next.add(key);
    this.printCols.set(next);
    writeKeys(PRINT_STORE, next);
  }

  /** Date d'envoi (AAAA-MM-JJ) ; vide si la facture n'a pas été envoyée. */
  sentLabel(b: BillSummary): string { return b.sentDate ? b.sentDate.slice(0, 10) : ''; }

  /** Date de paiement (AAAA-MM-JJ) ; vide si la facture n'est pas payée. */
  paidLabel(b: BillSummary): string { return b.paidDate ? b.paidDate.slice(0, 10) : ''; }

  /** Textes cherchés par le filtre d'une colonne : la valeur affichée (montants aussi sans espaces, avec . ou ,). */
  private _cellSearch(b: BillSummary, key: ColKey): unknown[] {
    const money = (v: number) => { const s = (+v).toFixed(2); return [s, s.replace('.', ',')]; };
    switch (key) {
      case 'number':   return [b.billNumber, b.parentBillIdentifier !== null ? kw('avoir') : kw('facture')];
      case 'company':  return [b.companyName];
      case 'period':   return [b.period];
      case 'sentDate': return b.sentDate ? [this.sentLabel(b), kw('envoyée')] : [kw('non envoyée')];
      case 'paidDate': return b.paidDate ? [this.paidLabel(b), kw('payée')] : [kw('non payée')];
      case 'ht':       return money(b.totalBeforeTax);
      case 'tps':      return money(b.tps);
      case 'tvq':      return money(b.tvq);
      case 'ttc':      return money(b.totalWithTax);
    }
  }

  // ── Export ────────────────────────────────────────────────────────────

  exportAs(type: ExportType): void {
    this.exportOpen.set(false);
    const ids = this.selectedList().map(b => b.billIdentifier);
    if (!ids.length) { this.error.set('Sélectionnez au moins une facture.'); return; }

    this.exporting.set(true);
    this.error.set('');

    if (type === 'excel' || type === 'csv') { this._exportTable(type); return; }

    // Lignes dans l'ordre du tableau (tri compris) ; colonnes à imprimer dans l'ordre d'affichage
    const columns = type === 'summary' ? this._printKeys() : undefined;
    this.invoiceSvc.exportReport(ids, type, this._buildFilterLabel(), columns).subscribe({
      next: blob => {
        this.exporting.set(false);
        const ext      = type === 'zip' ? 'zip' : 'pdf';
        const baseName = type === 'summary' ? 'rapport' : type === 'merged' ? 'factures_fusionnees' : 'factures';
        const suffix   = this._fileNameSuffix();
        this._downloadBlob(blob, `${baseName}_${suffix}.${ext}`);
        this.success.set(`Export "${this._exportLabel(type)}" téléchargé.`);
        setTimeout(() => this.success.set(''), 4000);
      },
      error: e => {
        this.exporting.set(false);
        this.error.set(httpErrorMessage(e, `Erreur export`));
      },
    });
  }

  /** Colonnes à imprimer, dans l'ordre du tableau à l'écran. */
  private _printKeys(): PrintKey[] {
    return PRINT_COLUMNS.map(c => c.key).filter(k => this.printCols().has(k));
  }

  /** Excel / CSV récapitulatif des factures sélectionnées, générés dans le navigateur :
   *  mêmes colonnes que le PDF récapitulatif (« Colonnes à imprimer ») et lignes dans l'ordre du tableau. */
  private _summaryDoc(): ExportDoc {
    const sel = this.selectedList();
    const t = this.totals();
    const r2 = (v: number) => Math.round(v * 100) / 100;
    type Def = { header: string; width?: number; money?: boolean; value: (b: BillSummary) => string | number; total?: number };
    const defs: Record<PrintKey, Def[]> = {
      number:   [{ header: 'N° facture', width: 18, value: b => b.billNumber }],
      company:  [{ header: 'Compagnie', width: 32, value: b => b.companyName }],
      period:   [{ header: 'Période', width: 10, value: b => b.period }],
      date:     [{ header: 'Date de la facture', width: 12, value: b => (b.billedDate ?? '').slice(0, 10) }],
      sentDate: [{ header: "Date d'envoi", width: 12, value: b => this.sentLabel(b) }],
      paidDate: [{ header: 'Date de paiement', width: 12, value: b => this.paidLabel(b) }],
      ht:       [{ header: 'Montant HT', money: true, value: b => +b.totalBeforeTax, total: r2(t.ht) }],
      tps:      [{ header: 'TPS', money: true, value: b => +b.tps, total: r2(t.tps) }],
      tvq:      [{ header: 'TVQ', money: true, value: b => +b.tvq, total: r2(t.tvq) }],
      ttc:      [{ header: 'Total TTC', money: true, value: b => +b.totalWithTax, total: r2(t.ttc) }],
    };
    const cols = this._printKeys().flatMap(k => defs[k]);
    const label = `Totaux : ${sel.length} facture(s)`;
    // Libellé des totaux dans la première colonne texte (ou en tête de ligne s'il n'y a que des montants)
    const labelAt = cols.findIndex(c => !c.money);
    const totalCells: (string | number)[] = cols.map((c, i) => c.money ? c.total! : i === labelAt ? label : '');
    if (labelAt < 0) { cols.unshift({ header: '', width: 18, value: () => '' }); totalCells.unshift(label); }
    return {
      fileName: TableExportService.fileName('rapport', this._fileNameSuffix()),
      title: 'Rapport de factures',
      subtitle: this._buildFilterLabel(),
      tables: [{
        title: 'Factures',
        striped: true,
        columns: cols.map(c => c.money ? { header: c.header, type: 'money' as const } : { header: c.header, width: c.width }),
        rows: [
          ...sel.map(b => ({ cells: cols.map(c => c.value(b)) })),
          { kind: 'total' as const, cells: totalCells },
        ],
      }],
    };
  }

  private async _exportTable(type: 'excel' | 'csv'): Promise<void> {
    try {
      const doc = this._summaryDoc();
      if (type === 'excel') await this.tableExport.toExcel(doc);
      else this.tableExport.toCsv(doc);
      this.success.set(`Export "${this._exportLabel(type)}" téléchargé.`);
      setTimeout(() => this.success.set(''), 4000);
    } catch {
      this.error.set(`Erreur export ${type === 'excel' ? 'Excel' : 'CSV'}.`);
    } finally {
      this.exporting.set(false);
    }
  }

  toggleExportMenu(e: MouseEvent): void {
    e.stopPropagation();
    this.exportOpen.update(v => !v);
  }

  @HostListener('document:click')
  onDocClick(): void { this.exportOpen.set(false); }

  // ── Helpers ───────────────────────────────────────────────────────────

  private _fileNameSuffix(): string {
    if (this.filterMode() === 'period' && this.periods().length)
      return this.periods().join('_');
    if (this.dateFrom || this.dateTo)
      return [this.dateFrom, this.dateTo].filter(Boolean).join('_au_');
    return todayIso();
  }

  private _buildFilterLabel(): string {
    const parts: string[] = [];
    if (this.filterMode() === 'period' && this.periods().length)
      parts.push(`Périodes : ${this.periods().join(', ')}`);
    else if (this.dateFrom || this.dateTo)
      parts.push(`Du ${this.dateFrom || '…'} au ${this.dateTo || '…'}`);
    if (this.selectedCompanies().size)
      parts.push(`Compagnies : ${[...this.selectedCompanies()].join(', ')}`);
    return parts.join(' | ');
  }

  private _exportLabel(type: ExportType): string {
    return type === 'summary' ? 'PDF Récapitulatif'
         : type === 'merged'  ? 'PDFs fusionnés'
         : type === 'excel'   ? 'Excel récapitulatif'
         : type === 'csv'     ? 'CSV récapitulatif'
         :                      'PDFs séparés (ZIP)';
  }

  private _downloadBlob(blob: Blob, fileName: string): void {
    downloadBlob(blob, fileName);
  }
}
