import { todayIso } from '../../shared/dates';
import { Component, ChangeDetectionStrategy, signal, computed, ElementRef, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { InvoiceService, BillSummary } from '../../../state/invoice/invoice.service';

import { downloadBlob } from '../../shared/download';
type DateField = 'sent' | 'paid';
type Status    = 'all' | 'paid' | 'unpaid';

@Component({
    selector: 'app-invoice-download',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './invoice-download.component.html',
    styleUrls: ['./invoice-download.component.scss']
})
export class InvoiceDownloadComponent {

  // ── Filtres ───────────────────────────────────────────────────────────
  dateFrom   = todayIso();
  dateTo     = todayIso();
  dateField  = signal<DateField>('sent');
  status     = signal<Status>('all');

  // ── Résultats ─────────────────────────────────────────────────────────
  bills   = signal<BillSummary[]>([]);
  loading = signal(false);
  error   = signal('');
  success = signal('');

  selectedIds = signal(new Set<number>());

  // ── Filtres par colonne (appliqués au tableau, à la sélection, aux totaux ET aux téléchargements) ──
  fNumber  = signal('');
  fCompany = signal('');
  fSent    = signal('');
  fPaid    = signal('');
  fMin     = signal<number | null>(null);
  fMax     = signal<number | null>(null);

  hasColumnFilter = computed(() => !!(this.fNumber().trim() || this.fCompany().trim() || this.fSent().trim()
    || this.fPaid().trim() || this.fMin() != null || this.fMax() != null));

  /** Factures affichées : résultat de la recherche, restreint par les filtres de colonnes. */
  displayedBills = computed(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const fmt  = (d: string | null) => d ? d.slice(0, 10).split('-').reverse().join('/') : '—';   // jj/mm/aaaa comme affiché
    const num = norm(this.fNumber()), co = norm(this.fCompany()), sent = this.fSent().trim(), paid = this.fPaid().trim();
    const min = this.fMin(), max = this.fMax();
    return this.bills().filter(b =>
      (!num  || norm(b.billNumber ?? '').includes(num)) &&
      (!co   || norm(b.companyName ?? '').includes(co)) &&
      (!sent || fmt(b.sentDate).includes(sent)) &&
      (!paid || fmt(b.paidDate).includes(paid)) &&
      (min == null || +b.totalWithTax >= min) &&
      (max == null || +b.totalWithTax <= max));
  });

  /** Sélection effective : uniquement les factures visibles (une facture masquée n'est jamais téléchargée). */
  selectedVisible = computed(() => this.displayedBills().filter(b => this.selectedIds().has(b.billIdentifier)));

  allSelected = computed(() => {
    const bs  = this.displayedBills();
    const sel = this.selectedIds();
    return bs.length > 0 && bs.every(b => sel.has(b.billIdentifier));
  });

  someSelected = computed(() => this.selectedVisible().length > 0);

  clearColumnFilters(): void {
    this.fNumber.set(''); this.fCompany.set(''); this.fSent.set(''); this.fPaid.set('');
    this.fMin.set(null); this.fMax.set(null);
  }

  /** Champ numérique vide → null (pas de filtre). */
  toNumber(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  totals = computed(() => {
    const sel = this.selectedVisible();
    return {
      ht:  sel.reduce((s, b) => s + +b.totalBeforeTax, 0),
      tps: sel.reduce((s, b) => s + +b.tps, 0),
      tvq: sel.reduce((s, b) => s + +b.tvq, 0),
      ttc: sel.reduce((s, b) => s + +b.totalWithTax, 0),
    };
  });

  downloading = signal(false);

  constructor(private invoiceSvc: InvoiceService) {}

  // ── Actions filtre ────────────────────────────────────────────────────
  setDateField(f: DateField): void { this.dateField.set(f); }
  setStatus(s: Status): void { this.status.set(s); }

  search(): void {
    this.error.set('');
    this.success.set('');
    this.selectedIds.set(new Set());
    this.bills.set([]);
    this.clearColumnFilters();
    this.loading.set(true);

    this.invoiceSvc.searchDownloadable({
      dateFrom:  this.dateFrom || undefined,
      dateTo:    this.dateTo   || undefined,
      dateField: this.dateField(),
      status:    this.status(),
    }).subscribe({
      next: list => {
        this.bills.set(list);
        this.selectedIds.set(new Set(list.map(b => b.billIdentifier)));
        this.loading.set(false);
      },
      error: e => {
        this.error.set(`Erreur de recherche : HTTP ${e.status}`);
        this.loading.set(false);
      },
    });
  }

  // ── Sélection ─────────────────────────────────────────────────────────
  /** Coche / décoche les factures VISIBLES (les factures masquées par un filtre gardent leur état). */
  toggleSelectAll(): void {
    const visible = this.displayedBills().map(b => b.billIdentifier);
    const all = this.allSelected();
    this.selectedIds.update(s => {
      const next = new Set(s);
      visible.forEach(id => all ? next.delete(id) : next.add(id));
      return next;
    });
  }

  toggleSelect(id: number): void {
    this.selectedIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  isSelected(id: number): boolean { return this.selectedIds().has(id); }

  // ── Téléchargement ────────────────────────────────────────────────────
  // ── Menu Télécharger ──────────────────────────────────────────────────
  menuOpen = signal(false);
  private host = inject(ElementRef<HTMLElement>);

  toggleMenu(e: Event): void {
    e.stopPropagation();
    this.menuOpen() ? this.closeMenu(false) : this.openMenu();
  }

  openMenu(e?: Event): void {
    e?.preventDefault();
    this.menuOpen.set(true);
    setTimeout(() => (this.host.nativeElement.querySelector('.export-menu [role=menuitem]') as HTMLElement | null)?.focus());
  }

  closeMenu(returnFocus = true): void {
    this.menuOpen.set(false);
    if (returnFocus) (this.host.nativeElement.querySelector('.export-wrap .btn-export') as HTMLElement | null)?.focus();
  }

  onMenuKey(e: KeyboardEvent): void {
    const items = Array.from(this.host.nativeElement.querySelectorAll('.export-menu [role=menuitem]')) as HTMLElement[];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => { e.preventDefault(); items[(i + n + items.length) % items.length]?.focus(); };
    if (e.key === 'ArrowDown') go(1);
    else if (e.key === 'ArrowUp') go(-1);
    else if (e.key === 'Escape') { e.preventDefault(); this.closeMenu(); }
    else if (e.key === 'Tab') this.closeMenu(false);
  }

  @HostListener('document:click')
  onDocClick(): void { if (this.menuOpen()) this.closeMenu(false); }

  /**
   * grouped    : un PDF par facture (avec ses avoirs) dans un ZIP (PDF seul si une facture).
   * merged-zip : toutes les factures (avec leurs avoirs) dans UN PDF, compressé en ZIP.
   * print      : ce même PDF unique, ouvert dans la boîte d'impression du navigateur.
   */
  download(kind: 'grouped' | 'merged-zip' | 'print'): void {
    this.closeMenu();
    const ids = this.selectedVisible().map(b => b.billIdentifier);
    if (!ids.length) { this.error.set('Sélectionnez au moins une facture visible.'); return; }

    this.downloading.set(true);
    this.error.set('');

    this.invoiceSvc.exportReport(ids, kind, this._buildFilterLabel()).subscribe({
      next: blob => {
        this.downloading.set(false);
        const n = ids.length;
        if (kind === 'print') {
          this._print(blob);
          this.success.set(`Impression de ${n} facture(s) ouverte.`);
        } else if (kind === 'merged-zip') {
          this._downloadBlob(blob, `factures_${this._fileNameSuffix()}.zip`);
          this.success.set(`${n} facture(s) dans un seul PDF (ZIP) téléchargée(s).`);
        } else {
          const ext = n > 1 ? 'zip' : 'pdf';
          this._downloadBlob(blob, `factures_${this._fileNameSuffix()}.${ext}`);
          this.success.set(n > 1 ? `${n} factures téléchargées (ZIP).` : 'Facture téléchargée (PDF).');
        }
        setTimeout(() => this.success.set(''), 4000);
      },
      error: e => {
        this.downloading.set(false);
        this.error.set(`Erreur ${kind === 'print' ? 'impression' : 'téléchargement'} : HTTP ${e.status}`);
      },
    });
  }

  /** Impression d'un PDF : cadre invisible + boîte d'impression ; repli sur un nouvel onglet si le
   *  navigateur ne permet pas d'imprimer un PDF intégré. */
  private _print(blob: Blob): void {
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.title = 'Impression des factures';
    frame.src = url;
    frame.onload = () => {
      try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
      catch { window.open(url, '_blank'); }
    };
    document.body.appendChild(frame);
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 10 * 60_000);
  }


  // ── Helpers ───────────────────────────────────────────────────────────
  private _fileNameSuffix(): string {
    if (this.dateFrom || this.dateTo)
      return [this.dateFrom, this.dateTo].filter(Boolean).join('_au_');
    return todayIso();
  }

  private _buildFilterLabel(): string {
    const parts: string[] = [];
    const dateLabel = this.dateField() === 'paid' ? 'Date de paiement' : "Date d'envoi";
    if (this.dateFrom || this.dateTo)
      parts.push(`${dateLabel} : du ${this.dateFrom || '…'} au ${this.dateTo || '…'}`);
    const s = this.status();
    parts.push(`Statut : ${s === 'paid' ? 'Payées' : s === 'unpaid' ? 'Non payées' : 'Toutes'}`);
    return parts.join(' | ');
  }

  private _downloadBlob(blob: Blob, fileName: string): void {
    downloadBlob(blob, fileName);
  }
}
