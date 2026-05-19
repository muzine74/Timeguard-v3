import {
  Component, OnInit, OnDestroy, signal, computed,
  ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoiceService, BillSummary, BillDetail } from '../../../state/invoice/invoice.service';
import { ConfigService } from '../../../state/config/config.service';

@Component({
  selector: 'app-invoice-send',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-send.component.html',
  styleUrls: ['./invoice-send.component.scss'],
})
export class InvoiceSendComponent implements OnInit, OnDestroy {
  // ── État global ──────────────────────────────────────────────────────────
  loading        = signal(false);
  sending        = signal(false);
  pdfGenerating  = signal(false);
  error          = signal('');
  success        = signal('');

  // ── Sidebar ──────────────────────────────────────────────────────────────
  unsentBills = signal<BillSummary[]>([]);
  search      = '';
  selected    = signal<BillSummary | null>(null);

  get filteredBills(): BillSummary[] {
    const q = this.search.toLowerCase();
    return q
      ? this.unsentBills().filter(b =>
          b.companyName.toLowerCase().includes(q) || b.billNumber.toLowerCase().includes(q))
      : this.unsentBills();
  }

  // ── Détail facture sélectionnée ──────────────────────────────────────────
  detail        = signal<BillDetail | null>(null);
  unpaidBills   = signal<BillSummary[]>([]);
  detailLoading = signal(false);

  /** true si la facture courante a été envoyée pendant cette session */
  private _sent = false;

  // ── Formulaire courriel ──────────────────────────────────────────────────
  recipients: string[] = [];
  emailInput  = '';
  subject     = '';
  body        = '';

  // ── Config fournisseur ───────────────────────────────────────────────────
  private _providerName = '';
  private destroyRef    = inject(DestroyRef);

  constructor(
    private invoiceSvc: InvoiceService,
    private configSvc:  ConfigService,
    private cdr:        ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.configSvc.get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: data => { this._providerName = data.config.companyName ?? ''; } });
    this._loadUnsent();
  }

  /** Quitter sans envoyer → supprimer le PDF généré */
  ngOnDestroy(): void {
    if (!this._sent) {
      const d = this.detail();
      if (d?.filePath) this.invoiceSvc.deletePdf(d.billIdentifier).subscribe();
    }
  }

  // ── Charger les factures non envoyées ─────────────────────────────────────
  private _loadUnsent(): void {
    this.loading.set(true);
    this.invoiceSvc.getAll({ onlyNotSent: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => {
          // Exclure les avoirs : ceux avec parentBillIdentifier défini (nouveaux)
          // et ceux dont le numéro se termine par -AV (anciens, sans parentBillIdentifier)
          this.unsentBills.set(list.filter(b =>
            b.parentBillIdentifier === null && !b.billNumber?.endsWith('-AV')
          ));
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: () => { this.loading.set(false); this.cdr.markForCheck(); },
      });
  }

  // ── Sélectionner une facture ──────────────────────────────────────────────
  selectBill(bill: BillSummary): void {
    if (this.selected()?.billIdentifier === bill.billIdentifier) return;

    // Supprimer le PDF de l'ancienne sélection si pas envoyé
    const prev = this.detail();
    if (prev?.filePath && !this._sent)
      this.invoiceSvc.deletePdf(prev.billIdentifier).subscribe();

    this._sent = false;
    this.selected.set(bill);
    this.detail.set(null);
    this.unpaidBills.set([]);
    this.recipients = [];
    this.emailInput = '';
    this.error.set('');
    this.success.set('');
    this.detailLoading.set(true);

    this.invoiceSvc.getById(bill.billIdentifier)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: d => {
          this.detail.set(d);
          if (d.clientEmail) this.recipients = [d.clientEmail];
          // Générer le PDF automatiquement
          this._generatePdf(d.billIdentifier);
          this._loadUnpaidForCompany(d.companyCode, d.billIdentifier);
        },
        error: () => { this.detailLoading.set(false); this.cdr.markForCheck(); },
      });
  }

  // ── Générer le PDF ────────────────────────────────────────────────────────
  private _generatePdf(id: number): void {
    this.pdfGenerating.set(true);
    this.invoiceSvc.generatePdf(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.detail.update(d => d ? { ...d, filePath: res.fileName } : d);
          this.pdfGenerating.set(false);
          this.cdr.markForCheck();
        },
        error: () => { this.pdfGenerating.set(false); this.cdr.markForCheck(); },
      });
  }

  // ── Charger les impayés de la compagnie ───────────────────────────────────
  private _loadUnpaidForCompany(companyCode: string, excludeId: number): void {
    this.invoiceSvc.getAll({ companyCode, onlyUnpaid: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => {
          const unpaid = list.filter(b => b.billIdentifier !== excludeId && b.parentBillIdentifier === null);
          this.unpaidBills.set(unpaid);
          this.buildMessage();
          this.detailLoading.set(false);
          this.cdr.markForCheck();
        },
        error: () => { this.buildMessage(); this.detailLoading.set(false); this.cdr.markForCheck(); },
      });
  }

  // ── Générer le message automatiquement ───────────────────────────────────
  buildMessage(): void {
    const d = this.detail();
    if (!d) return;
    const unpaid = this.unpaidBills();
    const amount = d.totalWithTax.toLocaleString('fr-CA', { minimumFractionDigits: 2 }) + ' $';

    this.subject = `Facture ${d.billNumber} — ${d.companyName}`;

    let msg = `Bonjour,\n\n`;
    msg += `Veuillez trouver en pièce jointe la facture ${d.billNumber} d'un montant de ${amount} pour la période ${d.period}.\n`;

    if (unpaid.length > 0) {
      msg += `\nNous vous rappelons que les factures suivantes sont en attente de paiement :\n`;
      unpaid.forEach(b => {
        const amt = b.totalWithTax.toLocaleString('fr-CA', { minimumFractionDigits: 2 });
        msg += `  — ${b.billNumber}  (${amt} $)\n`;
      });
      msg += `\nNous vous saurions gré de bien vouloir régulariser ces paiements dans les meilleurs délais.\n`;
    }

    msg += `\nMerci pour votre confiance.\n\nCordialement,\n${this._providerName}`;
    this.body = msg;
  }

  // ── Ouvrir la pièce jointe (PDF) ─────────────────────────────────────────
  openAttachment(): void {
    const d = this.detail();
    if (!d) return;
    this.invoiceSvc.downloadFile(d.billIdentifier)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        },
        error: () => this.error.set('Impossible d\'ouvrir le PDF.'),
      });
  }

  // ── Gestion des destinataires (multi) ─────────────────────────────────────
  onEmailKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this._addEmail();
    }
  }

  onEmailBlur(): void { this._addEmail(); }

  private _addEmail(): void {
    const email = this.emailInput.trim().replace(/,$/, '');
    if (!email) return;
    if (!this._validEmail(email)) { this.error.set(`Adresse invalide : ${email}`); return; }
    if (!this.recipients.includes(email)) this.recipients = [...this.recipients, email];
    this.emailInput = '';
    this.error.set('');
    this.cdr.markForCheck();
  }

  removeRecipient(email: string): void {
    this.recipients = this.recipients.filter(r => r !== email);
    this.cdr.markForCheck();
  }

  private _validEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  // ── Envoyer ───────────────────────────────────────────────────────────────
  send(): void {
    const d = this.detail();
    if (!d) return;
    if (this.recipients.length === 0) { this.error.set('Veuillez ajouter au moins un destinataire.'); return; }
    if (!this.subject.trim())         { this.error.set('Le sujet est requis.'); return; }
    if (!this.body.trim())            { this.error.set('Le message est requis.'); return; }

    this.error.set('');
    this.success.set('');
    this.sending.set(true);

    this.invoiceSvc.sendEmail(d.billIdentifier, {
      recipients: this.recipients,
      subject:    this.subject,
      body:       this.body,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this._sent = true;
        this.sending.set(false);
        this.success.set(res.message || 'Facture envoyée avec succès.');
        this.unsentBills.update(list => list.filter(b => b.billIdentifier !== d.billIdentifier));
        this.selected.set(null);
        this.detail.set(null);
        this.cdr.markForCheck();
      },
      error: err => {
        this.sending.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  trackByBillId(_: number, b: BillSummary): number { return b.billIdentifier; }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  hasFile  = computed(() => !!this.detail()?.filePath);
  pdfReady = computed(() => this.hasFile() && !this.pdfGenerating());
}
