import { Component, OnInit, signal, computed, ChangeDetectionStrategy, DestroyRef, inject, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BankTransactionsService, BankTransactionList, BankTransactionRow, BankImportResult, isMobileDeposit } from '../../../state/bank/bank-transactions.service';
import { AttachmentsService } from '../../../state/attachments/attachments.service';
import { downloadBlob } from '../../shared/download';
import { ConfirmService } from '../../../state/ui/confirm.service';
import { BankLexiconComponent, LINK_ICON, LINK_LABEL } from './bank-lexicon/bank-lexicon.component';
import { TableSort, SortValue } from '../../shared/table-sort';
import { MultiSelectComponent, MultiSelectOption } from '../../components/multi-select/multi-select.component';
import { httpErrorMessage } from '../../shared/http-error';
import { locale } from '../../../state/i18n/i18n.service';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { SearchHintComponent } from '../../components/search-hint/search-hint.component';
import { ExportDoc } from '../../../state/export/table-export.service';
import { searchTerms, matchesAll, listExportDoc, kw } from '../../shared/multi-search';

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
    imports: [CommonModule, FormsModule, MultiSelectComponent, BankLexiconComponent, ExportButtonsComponent, SearchHintComponent],
    templateUrl: './bank-statement.component.html',
    styleUrls: ['./bank-statement.component.scss']
})
export class BankStatementComponent implements OnInit {
  private svc        = inject(BankTransactionsService);
  private files      = inject(AttachmentsService);
  private confirm    = inject(ConfirmService);
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

  /** Critères « & » (ET) / « | » (OU) dans n'importe quelle colonne (ET) + valeurs cochées (OU dans une colonne, ET entre colonnes). */
  filtered = computed(() => {
    const terms = searchTerms(this.search());
    const picked = this.picked();
    return this._rows().filter(r => {
      for (const c of COLUMNS) if (picked[c].length && !picked[c].includes(this._id(r, c))) return false;
      if (!terms.length) return true;
      // Montants : tels qu'affichés (« 1 943,08 $ »), sans espace (« 1943,08 ») et bruts (« 1943.08 »)
      const amounts = [r.withdrawal, r.deposit].flatMap(a => a == null ? [] : [this.fmt(a), this.fmt(a).replace(/\s/g, ''), String(a)]);
      return matchesAll(terms, r.date, r.description, amounts, kw(r.validated ? 'validée' : 'non validée'),
                        r.linkName ?? '', r.linkType ? LINK_LABEL[r.linkType] : '');
    });
  });

  /** Export des lignes filtrées, dans l'ordre de tri affiché (toutes les pages). */
  exportRows = (): ExportDoc => listExportDoc({
    name: 'Releve_bancaire', title: 'Relevé bancaire', search: this.search(),
    extra: [this.dateFrom && `Du ${this.dateFrom}`, this.dateTo && `au ${this.dateTo}`].filter(Boolean).join(' '),
    columns: [{ header: 'Date', width: 12 }, { header: 'Description', width: 44 }, { header: 'Retrait', type: 'money' },
              { header: 'Dépôt', type: 'money' }, { header: 'Lié à', width: 28 }, { header: 'Validée', width: 10 }],
    rows: this.sorted().map(r => [r.date, r.description, r.withdrawal, r.deposit, r.linkName ?? '', r.validated ? 'Oui' : 'Non']),
    landscape: true,
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
      // La réponse ne contient pas la pièce jointe : garder celle de la ligne
      next: saved => {
        const cur = this._rows().find(r => r.bankTransactionId === row.bankTransactionId);
        this._replace({ ...saved, attachment: cur?.attachment ?? null, attachmentUrl: cur?.attachmentUrl ?? null });
        this._saving(row.bankTransactionId, false);
      },
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

  // ── Pièce jointe des « Dépôt Mobile » (clic sur la description → menu) ────
  readonly isMobile = (r: BankTransactionRow) => isMobileDeposit(r.description);
  /** Appareil tactile (téléphone, tablette) : propose « Prendre une photo ». */
  readonly canTakePhoto = typeof window !== 'undefined'
    && (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  attaching   = signal<ReadonlySet<string>>(new Set());
  attachError = signal('');
  menuFor     = signal<string | null>(null);   // ligne dont le menu est ouvert
  private _attachRow: BankTransactionRow | null = null;

  /** Clic sur la description d'un « Dépôt Mobile » : ouvre / ferme le menu de la pièce jointe. */
  toggleMenu(r: BankTransactionRow, ev: Event): void {
    ev.stopPropagation();
    if (!this.isMobile(r) || this.attaching().has(r.bankTransactionId) || this.renaming() === r.bankTransactionId) return;
    this.menuFor.set(this.menuFor() === r.bankTransactionId ? null : r.bankTransactionId);
  }

  @HostListener('document:click')
  @HostListener('document:keydown.escape')
  closeMenu(): void { if (this.menuFor()) this.menuFor.set(null); }

  /** Choisir un fichier existant ou prendre une photo (selon le champ fichier passé) ; remplace la pièce actuelle. */
  pickAttachment(r: BankTransactionRow, input: HTMLInputElement): void {
    this.menuFor.set(null);
    if (!this.isMobile(r) || this.attaching().has(r.bankTransactionId)) return;
    this._attachRow = r;
    input.value = '';
    input.click();
  }

  // Renommage dans la cellule : nom sans extension (l'extension d'origine est gardée)
  renaming    = signal<string | null>(null);   // ligne en cours de renommage
  renameDraft = signal('');

  /** Champ de renommage : reçoit le focus, texte sélectionné, dès qu'il apparaît. */
  @ViewChild('renameInput') set _renameInput(el: ElementRef<HTMLInputElement> | undefined) {
    if (el) setTimeout(() => { el.nativeElement.focus(); el.nativeElement.select(); });
  }

  /** Extension du document (« .pdf »), affichée après le champ de saisie. */
  extOf(name: string): string { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i) : ''; }

  startRename(r: BankTransactionRow): void {
    this.menuFor.set(null);
    const a = r.attachment;
    if (!a) return;
    const ext = this.extOf(a.name);
    this.renameDraft.set(ext ? a.name.slice(0, -ext.length) : a.name);
    this.renaming.set(r.bankTransactionId);
  }

  cancelRename(): void { this.renaming.set(null); }

  saveRename(r: BankTransactionRow): void {
    const a = r.attachment;
    const name = this.renameDraft().trim();
    if (!a || this.attaching().has(r.bankTransactionId)) return;
    if (!name) { this.attachError.set('Indiquez un nom.'); return; }
    const full = name + this.extOf(a.name);
    if (full === a.name) { this.renaming.set(null); return; }
    const id = r.bankTransactionId;
    this.attachError.set('');
    this._attaching(id, true);
    this.files.rename(a.id, full).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: item => {
        const cur = this._rows().find(x => x.bankTransactionId === id) ?? r;
        this._replace({ ...cur, attachment: item });
        this._attaching(id, false);
        this.renaming.set(null);
      },
      error: err => {
        this._attaching(id, false);
        this.attachError.set(httpErrorMessage(err, `La pièce jointe n'a pas été renommée`));
      },
    });
  }

  /** Retire la pièce jointe de la ligne, après confirmation. */
  async removeAttachment(r: BankTransactionRow): Promise<void> {
    this.menuFor.set(null);
    const a = r.attachment;
    if (!a || this.attaching().has(r.bankTransactionId)) return;
    if (!await this.confirm.danger('Supprimer la pièce jointe ?', a.name)) return;
    const id = r.bankTransactionId;
    this.attachError.set('');
    this._attaching(id, true);
    this.files.delete(a.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        const cur = this._rows().find(x => x.bankTransactionId === id) ?? r;
        this._replace({ ...cur, attachment: null, attachmentUrl: null });
        this._attaching(id, false);
      },
      error: err => {
        this._attaching(id, false);
        this.attachError.set(httpErrorMessage(err, `La pièce jointe n'a pas été supprimée`));
      },
    });
  }

  onAttachmentFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    const row = this._attachRow;
    this._attachRow = null;
    input.value = '';
    if (!f || !row) return;
    this.attachError.set('');
    const why = this.files.check(f);
    if (why) { this.attachError.set(`${f.name} : ${why}`); return; }

    const id = row.bankTransactionId;
    this._attaching(id, true);
    this.files.upload('bank', id, f).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: item => {
        const cur = this._rows().find(r => r.bankTransactionId === id) ?? row;
        const old = cur.attachment;
        this._replace({ ...cur, attachment: item, attachmentUrl: `/api/attachments/${item.id}/download` });
        this._attaching(id, false);
        // Une seule pièce par ligne : l'ancienne est retirée
        if (old && old.id !== item.id) this.files.delete(old.id).subscribe({ error: () => {} });
      },
      error: err => {
        this._attaching(id, false);
        this.attachError.set(httpErrorMessage(err, `La pièce jointe n'a pas été enregistrée`));
      },
    });
  }

  /** Clic sur le nom du document : l'ouvre dans un nouvel onglet (fichier récupéré avec la session). */
  openAttachment(r: BankTransactionRow, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const a = r.attachment;
    if (!a || !r.attachmentUrl) return;
    this.attachError.set('');
    // Onglet ouvert tout de suite (sinon bloqué comme fenêtre surgissante), rempli à la réception
    const win = window.open('', '_blank');
    this.svc.openAttachment(r.attachmentUrl).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        if (!win) { downloadBlob(blob, a.name); return; }
        const url = URL.createObjectURL(blob);
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: err => {
        win?.close();
        this.attachError.set(httpErrorMessage(err, `Impossible d'ouvrir la pièce jointe`));
      },
    });
  }

  private _attaching(id: string, on: boolean): void {
    const next = new Set(this.attaching());
    on ? next.add(id) : next.delete(id);
    this.attaching.set(next);
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
