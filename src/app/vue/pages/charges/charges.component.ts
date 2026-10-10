import { Component, OnInit, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChargesService, ChargeItem, ChargeCompanyItem } from '../../../state/charges/charges.service';
import { CompanyService, CompanySummary } from '../../../state/compagny/Company.service';

import { downloadBlob } from '../../shared/download';
interface CompanyRow {
  companyId:   string;
  companyName: string;
  percentage:  number;
}

@Component({
    selector: 'app-charges',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './charges.component.html',
    styleUrls: ['./charges.component.scss']
})
export class ChargesComponent implements OnInit {
  charges  = signal<ChargeItem[]>([]);
  companies = signal<CompanySummary[]>([]);
  loading  = signal(false);
  saving   = signal(false);
  error    = signal('');
  success  = signal('');

  expandedIds = signal<Set<string>>(new Set());

  // ── Recherche : mot-clé, période (date de la charge) et montant. Les critères se cumulent. ──
  fSearch = signal('');
  fFrom   = signal('');          // yyyy-MM-dd
  fTo     = signal('');
  fMin    = signal<number | null>(null);
  fMax    = signal<number | null>(null);

  hasFilters = computed(() => !!(this.fSearch().trim() || this.fFrom() || this.fTo() || this.fMin() != null || this.fMax() != null));

  shownCharges = computed(() => {
    const q = this._norm(this.fSearch()), from = this.fFrom(), to = this.fTo(), min = this.fMin(), max = this.fMax();
    // Un nombre tapé dans le mot-clé trouve aussi le montant (« 1200 » ou « 1200,50 »)
    const qAmount = q.replace(/\s/g, '').replace(',', '.');
    return this.charges().filter(c => {
      if (from && c.chargeDate < from) return false;
      if (to && c.chargeDate > to) return false;
      if (min != null && c.amount < min) return false;
      if (max != null && c.amount > max) return false;
      if (!q) return true;
      const text = this._norm([c.title, c.description ?? '', ...c.companies.map(co => co.companyName), ...c.documents.map(d => d.originalName)].join(' '));
      return text.includes(q) || (qAmount !== '' && !isNaN(Number(qAmount)) && c.amount.toFixed(2).includes(qAmount));
    });
  });

  /** Total des charges affichées (montants tels que saisis). */
  shownTotal = computed(() => this.shownCharges().reduce((sum, c) => sum + c.amount, 0));

  setAmount(which: 'min' | 'max', value: unknown): void {
    const n = value === '' || value == null ? null : Number(value);
    (which === 'min' ? this.fMin : this.fMax).set(n == null || isNaN(n) ? null : n);
  }

  resetFilters(): void {
    this.fSearch.set(''); this.fFrom.set(''); this.fTo.set(''); this.fMin.set(null); this.fMax.set(null);
  }

  /** Minuscules, sans accents (« electricite » trouve « Électricité »). */
  private _norm(s: string): string {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  // ── Modal (création / édition) ───────────────────────────────────────────
  modalOpen  = signal(false);
  editingId: string | null = null;
  title       = '';
  description = '';
  amount: number | null = null;
  isMonthly = false;
  taxIncluded = false;
  /** Date de la charge (yyyy-MM-dd). */
  chargeDate = '';
  /** La charge en cours de modification est une copie générée : elle ne peut pas devenir mensuelle. */
  editingGenerated = false;
  rows = signal<CompanyRow[]>([]);

  documents = signal<ChargeItem['documents']>([]);
  uploading = signal(false);

  private destroyRef = inject(DestroyRef);

  totalPercentage = computed(() => this.rows().reduce((s, r) => s + (+r.percentage || 0), 0));
  totalValid      = computed(() => Math.abs(this.totalPercentage() - 100) < 0.01);

  activeCompanies = computed(() => this.companies().filter(c => c.isActive));

  allCompaniesChecked = computed(() => {
    const total = this.activeCompanies().length;
    return total > 0 && this.rows().length === total;
  });
  someCompaniesChecked = computed(() =>
    this.rows().length > 0 && !this.allCompaniesChecked()
  );

  constructor(
    private chargesSvc: ChargesService,
    private companySvc: CompanyService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
    this.companySvc.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => { this.companies.set(list); this.cdr.markForCheck(); },
        error: () => {},
      });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.chargesSvc.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => { this.charges.set(list); this.loading.set(false); this.cdr.markForCheck(); },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  toggleExpand(charge: ChargeItem): void {
    this.expandedIds.update(set => {
      const next = new Set(set);
      if (next.has(charge.chargeId)) next.delete(charge.chargeId);
      else next.add(charge.chargeId);
      return next;
    });
  }

  isExpanded(charge: ChargeItem): boolean {
    return this.expandedIds().has(charge.chargeId);
  }

  // ── Modal — ouverture ─────────────────────────────────────────────────────
  openCreate(): void {
    this.editingId      = null;
    this.title          = '';
    this.description    = '';
    this.amount         = null;
    this.isMonthly      = false;
    this.taxIncluded    = false;
    this.chargeDate     = this._today();
    this.editingGenerated = false;
    this.rows.set([]);
    this.documents.set([]);
    this.error.set('');
    this.modalOpen.set(true);
  }

  openEdit(charge: ChargeItem, event: Event): void {
    event.stopPropagation();
    this.editingId      = charge.chargeId;
    this.title          = charge.title;
    this.description    = charge.description ?? '';
    this.amount         = charge.amount;
    this.isMonthly      = !!charge.isMonthly;
    this.taxIncluded    = !!charge.taxIncluded;
    this.chargeDate     = charge.chargeDate || this._today();
    this.editingGenerated = !!charge.isGenerated;
    this.rows.set(charge.companies.map(c => ({ companyId: c.companyId, companyName: c.companyName, percentage: c.percentage })));
    this.documents.set(charge.documents);
    this.error.set('');
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  // ── Compagnies — sélection (checkbox) + répartition ──────────────────────
  isCompanyChecked(companyId: string): boolean {
    return this.rows().some(r => r.companyId === companyId);
  }

  pctOf(companyId: string): number {
    return this.rows().find(r => r.companyId === companyId)?.percentage ?? 0;
  }

  toggleCompany(c: CompanySummary, checked: boolean): void {
    if (checked) {
      this.rows.update(rows => [...rows, { companyId: c.companyId, companyName: c.companyName, percentage: 0 }]);
    } else {
      this.rows.update(rows => rows.filter(r => r.companyId !== c.companyId));
    }
    this.redistributeEqually();
  }

  toggleAllCompanies(checked: boolean): void {
    this.rows.set(checked
      ? this.activeCompanies().map(c => ({ companyId: c.companyId, companyName: c.companyName, percentage: 0 }))
      : []);
    this.redistributeEqually();
  }

  removeCompany(companyId: string): void {
    this.rows.update(rows => rows.filter(r => r.companyId !== companyId));
    this.redistributeEqually();
  }

  redistributeEqually(): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    const share = Math.round((100 / rows.length) * 100) / 100;
    const updated = rows.map((r, i) => ({
      ...r,
      // La dernière ligne absorbe l'écart d'arrondi pour garder un total exact de 100.
      percentage: i === rows.length - 1
        ? Math.round((100 - share * (rows.length - 1)) * 100) / 100
        : share,
    }));
    this.rows.set(updated);
  }

  onPercentageChange(companyId: string, value: number): void {
    this.rows.update(rows => rows.map(r => r.companyId === companyId ? { ...r, percentage: +value || 0 } : r));
  }

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  save(): void {
    const title = this.title.trim();
    if (!title) { this.error.set('Le titre est requis.'); return; }
    if (this.amount == null || this.amount < 0) { this.error.set('Le montant est requis.'); return; }
    if (!this.chargeDate) { this.error.set('La date de la charge est requise.'); return; }
    if (this.rows().length > 0 && !this.totalValid()) {
      this.error.set(`La somme des pourcentages doit être égale à 100 % (actuellement ${this.totalPercentage().toFixed(2)} %).`);
      return;
    }

    const companies: ChargeCompanyItem[] = this.rows().map(r => ({ companyId: r.companyId, percentage: r.percentage }));
    const payload = { title, description: this.description.trim(), amount: this.amount, isMonthly: this.isMonthly && !this.editingGenerated, chargeDate: this.chargeDate, taxIncluded: this.taxIncluded, companies };

    this.saving.set(true);
    this.error.set('');
    const req$ = this.editingId
      ? this.chargesSvc.update(this.editingId, payload)
      : this.chargesSvc.create(payload);

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(this.editingId ? 'Charge mise à jour.' : 'Charge créée.');
        setTimeout(() => this.success.set(''), 3000);
        this.closeModal();
        this.load();
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  remove(charge: ChargeItem, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Supprimer la charge "${charge.title}" et ses ${charge.documents.length} document(s) ?`)) return;

    this.chargesSvc.delete(charge.chargeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.charges.update(list => list.filter(c => c.chargeId !== charge.chargeId));
          this.success.set('Charge supprimée.');
          setTimeout(() => this.success.set(''), 3000);
          this.cdr.markForCheck();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.cdr.markForCheck();
        },
      });
  }

  // ── Documents (dans la modale d'édition) ─────────────────────────────────
  onFileSelected(event: Event): void {
    if (!this.editingId) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploading.set(true);
    this.chargesSvc.uploadDocument(this.editingId, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.uploading.set(false);
          input.value = '';
          this._reloadDocuments();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.uploading.set(false);
          input.value = '';
          this.cdr.markForCheck();
        },
      });
  }

  downloadDocument(doc: ChargeItem['documents'][number], chargeId?: string): void {
    const id = chargeId ?? this.editingId;
    if (!id) return;
    this.chargesSvc.downloadDocument(id, doc.chargeDocumentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(blob => {
        downloadBlob(blob, doc.originalName);
      });
  }

  removeDocument(doc: ChargeItem['documents'][number]): void {
    if (!this.editingId) return;
    this.chargesSvc.deleteDocument(this.editingId, doc.chargeDocumentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this._reloadDocuments(),
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.cdr.markForCheck();
        },
      });
  }

  private _reloadDocuments(): void {
    if (!this.editingId) return;
    this.chargesSvc.getById(this.editingId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(charge => {
        this.documents.set(charge.documents);
        this.charges.update(list => list.map(c => c.chargeId === charge.chargeId ? charge : c));
        this.cdr.markForCheck();
      });
  }

  /** Aujourd'hui, yyyy-MM-dd (heure locale). */
  private _today(): string {
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  /** Jour du mois de la date choisie (« le 15 de chaque mois »). */
  get chargeDay(): number | null {
    const day = Number((this.chargeDate || '').slice(8, 10));
    return day >= 1 && day <= 31 ? day : null;
  }

  /** Date yyyy-MM-dd affichée sans décalage de fuseau horaire. */
  fmtDay(day: string): string {
    return day ? new Date(day + 'T12:00:00').toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  }

  fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
