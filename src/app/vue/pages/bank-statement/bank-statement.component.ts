import { Component, OnInit, signal, computed, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BankTransactionsService, BankTransactionList, BankTransactionRow, BankImportResult } from '../../../state/bank/bank-transactions.service';
import { BankLexiconComponent, LINK_ICON, LINK_LABEL } from './bank-lexicon/bank-lexicon.component';
import { TableSort, SortValue } from '../../shared/table-sort';
import { MultiSelectComponent, MultiSelectOption } from '../../components/multi-select/multi-select.component';
import { httpErrorMessage } from '../../shared/http-error';
import { locale } from '../../../state/i18n/i18n.service';

type Column = 'date' | 'description' | 'withdrawal' | 'deposit' | 'linkName' | 'validated';
const COLUMNS: Column[] = ['date', 'description', 'withdrawal', 'deposit', 'linkName', 'validated'];
const NO_PICK: Record<Column, string[]> = { date: [], description: [], withdrawal: [], deposit: [], linkName: [], validated: [] };
type Tab = 'statement' | 'lexicon';
const VALIDATED_OPTIONS: MultiSelectOption[] = [{ id: 'true', label: 'Validée' }, { id: 'false', label: 'Non validée' }];
const EMPTY = '__vide__';          // valeur « (vide) » d'un filtre de colonne
const PAGE_SIZE = 50;

const MAX_SIZE = 5 * 1024 * 1024;

/** Relevé bancaire : chargement d'un fichier CSV en base, puis liste des lignes enregistrées. */
@Component({
    selector: 'app-bank-statement',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, MultiSelectComponent, BankLexiconComponent],
    templateUrl: './bank-statement.component.html',
    styleUrls: ['./bank-statement.component.scss']
})
export class BankStatementComponent implements OnInit {
  private svc        = inject(BankTransactionsService);
  private destroyRef = inject(DestroyRef);

  // ── Onglets : Relevé bancaire / Lexique ───────────────────────────────────
  tab = signal<Tab>('statement');
  readonly linkIcon  = LINK_ICON;
  readonly linkLabel = LINK_LABEL;
  private _lexiconChanged = false;

  setTab(t: Tab): void {
    this.tab.set(t);
    // Le lexique a changé : recalculer les liens du relevé
    if (t === 'statement' && this._lexiconChanged) { this._lexiconChanged = false; this.load(); }
  }

  onLexiconChanged(): void { this._lexiconChanged = true; }

  /** Flèches gauche / droite entre les deux onglets. */
  onTabKey(ev: KeyboardEvent, other: HTMLElement): void {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    this.setTab(this.tab() === 'statement' ? 'lexicon' : 'statement');
    other.focus();
  }

  // ── Import ────────────────────────────────────────────────────────────────
  file        = signal<File | null>(null);
  importing   = signal(false);
  importError = signal('');
  importErrorLines = signal<string[]>([]);
  result      = signal<BankImportResult | null>(null);

  // ── Liste ─────────────────────────────────────────────────────────────────
  dateFrom = '';
  dateTo   = '';
  loading  = signal(false);
  error    = signal('');
  list     = signal<BankTransactionList | null>(null);

  // ── Recherche, filtres par colonne, tri, pages (dans le navigateur, sans nouvel appel) ──
  search  = signal('');
  picked  = signal<Record<Column, string[]>>({ ...NO_PICK });
  page    = signal(1);
  readonly sort = new TableSort<Column>(['date', 'withdrawal', 'deposit']);

  private _rows = computed(() => this.list()?.rows ?? []);

  /** Valeur d'une cellule pour un filtre de colonne (une cellule vide a sa propre valeur). */
  private _id(r: BankTransactionRow, c: Column): string {
    const v = r[c];
    return v === null || v === '' ? EMPTY : String(v);
  }

  /** Valeurs distinctes de chaque colonne (parmi les lignes chargées), pour les listes à cocher. */
  options = computed<Record<Column, MultiSelectOption[]>>(() => {
    const rows = this._rows();
    const build = (c: Column): MultiSelectOption[] => {
      const ids = [...new Set(rows.map(r => this._id(r, c)))];
      const num = c === 'withdrawal' || c === 'deposit';
      ids.sort((a, b) => a === EMPTY ? 1 : b === EMPTY ? -1 : num ? Number(a) - Number(b) : a.localeCompare(b, 'fr', { numeric: true }));
      return ids.map(id => ({ id, label: id === EMPTY ? '(vide)' : num ? this.fmt(Number(id)) : id }));
    };
    return { date: build('date'), description: build('description'), withdrawal: build('withdrawal'), deposit: build('deposit'),
             linkName: build('linkName').map(o => o.id === EMPTY ? { ...o, label: '(aucun lien)' } : o), validated: VALIDATED_OPTIONS };
  });

  /** Mot-clé dans n'importe quelle colonne (ET entre les mots) + valeurs cochées (OU dans une colonne, ET entre colonnes). */
  filtered = computed(() => {
    const words = this._norm(this.search()).split(' ').filter(Boolean);
    const picked = this.picked();
    return this._rows().filter(r => {
      for (const c of COLUMNS) if (picked[c].length && !picked[c].includes(this._id(r, c))) return false;
      if (!words.length) return true;
      // Montants : tels qu'affichés (« 1 943,08 $ »), sans espace (« 1943,08 ») et bruts (« 1943.08 »)
      const amounts = [r.withdrawal, r.deposit].flatMap(a => a == null ? [] : [this.fmt(a), this.fmt(a).replace(/\s/g, ''), String(a)]);
      const text = this._norm([r.date, r.description, ...amounts, r.validated ? 'validée' : 'non validée',
                               r.linkName ?? '', r.linkType ? LINK_LABEL[r.linkType] : ''].join(' '));
      return words.every(w => text.includes(w));
    });
  });

  sorted = computed(() => this.sort.apply(this.filtered(), (r, k): SortValue => r[k]));

  pageCount = computed(() => Math.max(1, Math.ceil(this.sorted().length / PAGE_SIZE)));
  paged     = computed(() => {
    const p = Math.min(this.page(), this.pageCount());
    return this.sorted().slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });
  currentPage = computed(() => Math.min(this.page(), this.pageCount()));

  // Totaux des lignes affichées (filtres appliqués)
  totalWithdrawals = computed(() => this._sum('withdrawal'));
  totalDeposits    = computed(() => this._sum('deposit'));
  net              = computed(() => Math.round((this.totalDeposits() - this.totalWithdrawals()) * 100) / 100);
  hasFilters       = computed(() => !!this.search().trim() || COLUMNS.some(c => this.picked()[c].length > 0));

  validatedCount = computed(() => this.filtered().filter(r => r.validated).length);
  linkedCount    = computed(() => this.filtered().filter(r => r.linkType).length);

  // ── Colonne « Validée » ───────────────────────────────────────────────────
  saving        = signal<ReadonlySet<string>>(new Set());
  validateError = signal('');

  /** Coche / décoche « Validée » : affiché tout de suite, annulé si l'enregistrement échoue. */
  setValidated(row: BankTransactionRow, validated: boolean): void {
    if (this.saving().has(row.bankTransactionId)) return;
    this.validateError.set('');
    this._replace({ ...row, validated });
    this._saving(row.bankTransactionId, true);
    this.svc.setValidated(row.bankTransactionId, validated).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: saved => { this._replace(saved); this._saving(row.bankTransactionId, false); },
      error: err => {
        this._replace(row);
        this._saving(row.bankTransactionId, false);
        this.validateError.set(httpErrorMessage(err, `La validation n'a pas été enregistrée`));
      },
    });
  }

  private _replace(row: BankTransactionRow): void {
    this.list.update(l => l ? { ...l, rows: l.rows.map(r => r.bankTransactionId === row.bankTransactionId ? row : r) } : l);
  }

  private _saving(id: string, on: boolean): void {
    const next = new Set(this.saving());
    on ? next.add(id) : next.delete(id);
    this.saving.set(next);
  }

  trackRow(_: number, r: BankTransactionRow): string { return r.bankTransactionId; }

  validatedTitle(r: BankTransactionRow): string {
    if (!r.validated || !r.validatedAt) return '';
    const d = new Date(r.validatedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
    return `Validée le ${d}${r.validatedBy ? ' par ' + r.validatedBy : ''}`;
  }

  private _sum(c: 'withdrawal' | 'deposit'): number {
    return Math.round(this.filtered().reduce((s, r) => s + (r[c] ?? 0), 0) * 100) / 100;
  }

  /** Minuscules, sans accents, espaces insécables et multiples réduits (« 1 943,08 » se trouve avec « 1943,08 » ou « 1 943 »). */
  private _norm(s: string): string {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  setSearch(v: string): void { this.search.set(v); this.page.set(1); }
  setPicked(c: Column, ids: string[]): void { this.picked.update(p => ({ ...p, [c]: ids })); this.page.set(1); }
  toggleSort(c: Column): void { this.sort.toggle(c); this.page.set(1); }
  resetFilters(): void {
    this.search.set('');
    this.picked.set({ ...NO_PICK });
    this.page.set(1);
  }
  goTo(p: number): void { this.page.set(Math.min(Math.max(1, p), this.pageCount())); }

  ngOnInit(): void { this.load(); }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0] ?? null;
    this.result.set(null);
    this.importError.set('');
    this.importErrorLines.set([]);
    if (f && !f.name.toLowerCase().endsWith('.csv')) { this.file.set(null); this.importError.set('Le fichier doit être un CSV (.csv).'); return; }
    if (f && f.size > MAX_SIZE)                      { this.file.set(null); this.importError.set('Fichier trop volumineux (5 Mo maximum).'); return; }
    this.file.set(f);
  }

  importFile(input: HTMLInputElement): void {
    const f = this.file();
    if (!f || this.importing()) return;
    this.importing.set(true);
    this.importError.set('');
    this.importErrorLines.set([]);
    this.result.set(null);
    this.svc.importCsv(f).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: r => {
        this.importing.set(false);
        this.result.set(r);
        this.file.set(null);
        input.value = '';
        // Afficher la période du fichier qui vient d'être chargé
        if (r.dateMin && r.dateMax) { this.dateFrom = r.dateMin; this.dateTo = r.dateMax; }
        this.load();
      },
      error: err => {
        this.importing.set(false);
        this.importError.set(httpErrorMessage(err, `Le chargement a échoué`));
        this.importErrorLines.set(err?.error?.errors ?? []);
      },
    });
  }

  load(): void {
    if (this.dateFrom && this.dateTo && this.dateFrom > this.dateTo) { this.error.set('La date de début doit être avant la date de fin.'); return; }
    this.error.set('');
    this.loading.set(true);
    this.svc.list(this.dateFrom || undefined, this.dateTo || undefined).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: l => {
        this.list.set(l);
        this.loading.set(false);
        const opts = this.options();
        this.picked.update(p => ({
          date:        p.date.filter(id => opts.date.some(o => o.id === id)),
          description: p.description.filter(id => opts.description.some(o => o.id === id)),
          withdrawal:  p.withdrawal.filter(id => opts.withdrawal.some(o => o.id === id)),
          deposit:     p.deposit.filter(id => opts.deposit.some(o => o.id === id)),
          linkName:    p.linkName.filter(id => opts.linkName.some(o => o.id === id)),
          validated:   p.validated,
        }));
        this.page.set(1);
      },
      error: err => { this.error.set(httpErrorMessage(err, `Impossible de charger le relevé`)); this.loading.set(false); },
    });
  }

  clearDates(): void { this.dateFrom = ''; this.dateTo = ''; this.load(); }

  fmt(val: number | null): string {
    return val == null ? '' : val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  plural(n: number, one: string, many: string): string { return `${n} ${n > 1 ? many : one}`; }
}
