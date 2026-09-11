import {
  Component, ChangeDetectionStrategy, signal, computed, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { InvoiceService, BillSummary } from '../../../state/invoice/invoice.service';

type FilterMode = 'date' | 'period';
type ExportType = 'summary' | 'merged' | 'zip';

@Component({
  selector: 'app-invoice-report',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-report.component.html',
  styleUrls:  ['./invoice-report.component.scss'],
})
export class InvoiceReportComponent {

  // ── Filtres ───────────────────────────────────────────────────────────
  filterMode  = signal<FilterMode>('date');
  dateFrom    = '';
  dateTo      = '';

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
  displayedBills = computed(() => {
    let bills = this._allBills();

    const periods = this.periods();
    if (periods.length > 0)
      bills = bills.filter(b => periods.includes(b.period));

    const sel = this.selectedCompanies();
    bills = bills.filter(b => sel.has(b.companyName));

    return bills;
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

  someSelected  = computed(() => this.selectedIds().size > 0);

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

  constructor(private invoiceSvc: InvoiceService) {}

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
        this.error.set(`Erreur chargement : HTTP ${e.status}`);
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
    const q = this.companySearch.toLowerCase();
    return q
      ? this.availableCompanies().filter(n => n.toLowerCase().includes(q))
      : this.availableCompanies();
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

  // ── Export ────────────────────────────────────────────────────────────

  exportAs(type: ExportType): void {
    this.exportOpen.set(false);
    const ids = [...this.selectedIds()];
    if (!ids.length) { this.error.set('Sélectionnez au moins une facture.'); return; }

    this.exporting.set(true);
    this.error.set('');

    this.invoiceSvc.exportReport(ids, type, this._buildFilterLabel()).subscribe({
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
        this.error.set(`Erreur export : HTTP ${e.status}`);
      },
    });
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
    return new Date().toISOString().slice(0, 10);
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
         :                      'PDFs séparés (ZIP)';
  }

  private _downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}
