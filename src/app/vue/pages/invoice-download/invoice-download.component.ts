import { Component, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { InvoiceService, BillSummary } from '../../../state/invoice/invoice.service';

type DateField = 'sent' | 'paid';
type Status    = 'all' | 'paid' | 'unpaid';

@Component({
  selector: 'app-invoice-download',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-download.component.html',
  styleUrls:  ['./invoice-download.component.scss'],
})
export class InvoiceDownloadComponent {

  // ── Filtres ───────────────────────────────────────────────────────────
  dateFrom   = '';
  dateTo     = '';
  dateField  = signal<DateField>('sent');
  status     = signal<Status>('all');

  // ── Résultats ─────────────────────────────────────────────────────────
  bills   = signal<BillSummary[]>([]);
  loading = signal(false);
  error   = signal('');
  success = signal('');

  selectedIds = signal(new Set<number>());

  allSelected = computed(() => {
    const bs  = this.bills();
    const sel = this.selectedIds();
    return bs.length > 0 && bs.every(b => sel.has(b.billIdentifier));
  });

  someSelected = computed(() => this.selectedIds().size > 0);

  totals = computed(() => {
    const sel = this.bills().filter(b => this.selectedIds().has(b.billIdentifier));
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
  toggleSelectAll(): void {
    if (this.allSelected())
      this.selectedIds.set(new Set());
    else
      this.selectedIds.set(new Set(this.bills().map(b => b.billIdentifier)));
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
  download(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length) { this.error.set('Sélectionnez au moins une facture.'); return; }

    this.downloading.set(true);
    this.error.set('');

    const filterLabel = this._buildFilterLabel();
    this.invoiceSvc.exportReport(ids, 'grouped', filterLabel).subscribe({
      next: blob => {
        this.downloading.set(false);
        const ext      = ids.length > 1 ? 'zip' : 'pdf';
        const fileName = `factures_${this._fileNameSuffix()}.${ext}`;
        this._downloadBlob(blob, fileName);
        this.success.set(ids.length > 1
          ? `${ids.length} factures téléchargées (ZIP).`
          : 'Facture téléchargée (PDF).');
        setTimeout(() => this.success.set(''), 4000);
      },
      error: e => {
        this.downloading.set(false);
        this.error.set(`Erreur téléchargement : HTTP ${e.status}`);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private _fileNameSuffix(): string {
    if (this.dateFrom || this.dateTo)
      return [this.dateFrom, this.dateTo].filter(Boolean).join('_au_');
    return new Date().toISOString().slice(0, 10);
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
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
}
