import {
  Component, OnInit, OnDestroy, signal, computed,
  ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { InvoiceService, BillSummary, BillDetail } from '../../../state/invoice/invoice.service';
import { ConfigService } from '../../../state/config/config.service';
import { CompanyService, ContactItem } from '../../../state/compagny/Company.service';

const L = (msg: string, ...args: unknown[]) => console.log(`[InvoiceSend] ${msg}`, ...args);
const W = (msg: string, ...args: unknown[]) => console.warn(`[InvoiceSend] ⚠ ${msg}`, ...args);
const E = (msg: string, ...args: unknown[]) => console.error(`[InvoiceSend] ✗ ${msg}`, ...args);

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

  private _sent = false;

  // ── Contacts de la compagnie ─────────────────────────────────────────────
  companyContacts  = signal<ContactItem[]>([]);
  contactsLoading  = signal(false);
  selectedContacts = new Set<string>();

  // ── Formulaire courriel ──────────────────────────────────────────────────
  recipients: string[] = [];
  emailInput  = '';
  subject     = '';
  body        = '';

  // ── Pièces jointes additionnelles ─────────────────────────────────────────
  extraAttachments = signal<File[]>([]);
  private static readonly ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'];

  private _providerName = '';
  private destroyRef    = inject(DestroyRef);

  constructor(
    private invoiceSvc:  InvoiceService,
    private configSvc:   ConfigService,
    private companySvc:  CompanyService,
    private route:       ActivatedRoute,
    private cdr:         ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    L('ngOnInit — chargement config + factures non envoyées');
    this.configSvc.get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this._providerName = data.config.companyName ?? '';
          L('Config chargée | fournisseur: %s | SMTP: %s:%s', this._providerName, data.config.smtpServer, data.config.smtpPort);
        },
        error: err => E('Erreur chargement config', err),
      });

    const preselectId = Number(this.route.snapshot.queryParamMap.get('billId')) || null;
    this._loadUnsent(preselectId);
  }

  ngOnDestroy(): void {
    if (!this._sent) {
      const d = this.detail();
      if (d?.filePath) {
        L('ngOnDestroy — suppression PDF non envoyé: %s', d.filePath);
        this.invoiceSvc.deletePdf(d.billIdentifier).subscribe();
      }
    }
  }

  // ── Charger les factures non envoyées ─────────────────────────────────────
  private _loadUnsent(preselectId: number | null = null): void {
    L('_loadUnsent — GET /api/bills?onlyNotSent=true');
    this.loading.set(true);
    this.invoiceSvc.getAll({ onlyNotSent: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => {
          // Exclure les factures et avoirs déjà envoyés (avoirs contournent le filtre onlyNotSent côté API)
          const filtered = list.filter(b => !b.isSent);
          L('Factures non envoyées: %d total → %d après filtre isSent', list.length, filtered.length);
          this.unsentBills.set(filtered);
          this.loading.set(false);
          this.cdr.markForCheck();

          if (preselectId) {
            const match = filtered.find(b => b.billIdentifier === preselectId);
            if (match) {
              L('Présélection depuis query param billId=%d', preselectId);
              this.selectBill(match);
            } else {
              W('billId=%d introuvable parmi les factures non envoyées', preselectId);
            }
          }
        },
        error: err => {
          E('Erreur chargement factures', err.status, err.message);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  // ── Sélectionner une facture ──────────────────────────────────────────────
  selectBill(bill: BillSummary): void {
    if (this.selected()?.billIdentifier === bill.billIdentifier) {
      L('selectBill — facture déjà sélectionnée: #%d', bill.billIdentifier);
      return;
    }
    L('selectBill — sélection: #%d %s | companyCode: %s | companyId: %s',
      bill.billIdentifier, bill.billNumber, bill.companyCode, bill.companyId);

    const prev = this.detail();
    if (prev?.filePath && !this._sent) {
      L('selectBill — suppression ancien PDF: %s', prev.filePath);
      this.invoiceSvc.deletePdf(prev.billIdentifier).subscribe();
    }

    this._sent = false;
    this.selected.set(bill);
    this.detail.set(null);
    this.unpaidBills.set([]);
    this.companyContacts.set([]);
    this.selectedContacts.clear();
    this.recipients = [];
    this.emailInput = '';
    this.extraAttachments.set([]);
    this.error.set('');
    this.success.set('');
    this.detailLoading.set(true);

    L('selectBill — GET /api/bills/%d', bill.billIdentifier);
    this.invoiceSvc.getById(bill.billIdentifier)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: d => {
          L('Détail facture chargé: #%d | companyId: %s | filePath: %s | clientEmail: %s',
            d.billIdentifier, d.companyId, d.filePath, d.clientEmail);
          this.detail.set(d);
          this._generatePdf(d.billIdentifier);
          this._loadUnpaidForCompany(d.companyCode, d.billIdentifier);
          // Utiliser companyId seulement si c'est un vrai GUID (non vide)
          const cid = d.companyId && d.companyId !== '00000000-0000-0000-0000-000000000000'
            ? d.companyId : d.companyCode;
          L('CompanyId résolu pour contacts: %s', cid);
          this._loadCompanyContacts(cid);
        },
        error: err => {
          E('Erreur chargement détail facture #%d', bill.billIdentifier, err.status, err.message);
          this.detailLoading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  // ── Générer le PDF ────────────────────────────────────────────────────────
  private _generatePdf(id: number): void {
    L('_generatePdf — POST /api/bills/%d/pdf', id);
    this.pdfGenerating.set(true);
    this.invoiceSvc.generatePdf(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          L('PDF généré: %s', res.fileName);
          this.detail.update(d => d ? { ...d, filePath: res.fileName } : d);
          this.pdfGenerating.set(false);
          this.cdr.markForCheck();
        },
        error: err => {
          E('Erreur génération PDF #%d', id, err.status, err.message);
          this.pdfGenerating.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  // ── Charger les impayés de la compagnie ───────────────────────────────────
  private _loadUnpaidForCompany(companyCode: string, excludeId: number): void {
    L('_loadUnpaidForCompany — companyCode: %s, exclure #%d', companyCode, excludeId);
    this.invoiceSvc.getAll({ companyCode, onlyUnpaid: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => {
          const unpaid = list.filter(b => b.billIdentifier !== excludeId && b.parentBillIdentifier === null);
          L('Impayés: %d trouvés pour %s', unpaid.length, companyCode);
          this.unpaidBills.set(unpaid);
          this.buildMessage();
          this.detailLoading.set(false);
          this.cdr.markForCheck();
        },
        error: err => {
          E('Erreur chargement impayés', err.status, err.message);
          this.buildMessage();
          this.detailLoading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  // ── Charger les contacts de la compagnie ─────────────────────────────────
  private _loadCompanyContacts(companyId: string): void {
    L('_loadCompanyContacts — companyId: %s', companyId);
    if (!companyId) {
      W('_loadCompanyContacts — companyId vide, contacts non chargés');
      return;
    }
    this.contactsLoading.set(true);
    this.companySvc.getContacts(companyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: contacts => {
          L('Contacts chargés: %d total | actifs avec mail: %d',
            contacts.length,
            contacts.filter(c => c.isActive && c.mail).length);
          contacts.forEach(c => L('  Contact: %s | mail: %s | actif: %s', c.name, c.mail, c.isActive));

          this.companyContacts.set(contacts);
          this.selectedContacts.clear();
          contacts.filter(c => c.isActive && c.mail).forEach(c => this.selectedContacts.add(c.contactId));
          this._syncRecipientsFromContacts();

          // Fallback : si aucun contact, utiliser clientEmail du snapshot de la facture
          if (this.recipients.length === 0) {
            const clientEmail = this.detail()?.clientEmail?.trim();
            if (clientEmail) {
              this.recipients = [clientEmail];
              L('Fallback clientEmail utilisé: %s', clientEmail);
            } else {
              W('Aucun contact et aucun clientEmail — destinataires vides');
            }
          }

          L('Destinataires finaux: %o', this.recipients);
          this.contactsLoading.set(false);
          this.cdr.markForCheck();
        },
        error: err => {
          E('Erreur chargement contacts companyId=%s | HTTP %d', companyId, err.status, err.message);
          // Fallback sur clientEmail même en cas d'erreur
          const clientEmail = this.detail()?.clientEmail?.trim();
          if (clientEmail && !this.recipients.includes(clientEmail)) {
            this.recipients = [clientEmail];
            L('Fallback clientEmail après erreur contacts: %s', clientEmail);
          }
          this.contactsLoading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  isContactSelected(contactId: string): boolean {
    return this.selectedContacts.has(contactId);
  }

  toggleContactSelection(contact: ContactItem): void {
    if (!contact.mail) { W('toggleContactSelection — contact sans email: %s', contact.name); return; }
    if (this.selectedContacts.has(contact.contactId)) {
      this.selectedContacts.delete(contact.contactId);
      L('Contact désélectionné: %s (%s)', contact.name, contact.mail);
    } else {
      this.selectedContacts.add(contact.contactId);
      L('Contact sélectionné: %s (%s)', contact.name, contact.mail);
    }
    this._syncRecipientsFromContacts();
    L('Destinataires après toggle: %o', this.recipients);
    this.cdr.markForCheck();
  }

  private _syncRecipientsFromContacts(): void {
    const contacts = this.companyContacts();
    if (contacts.length === 0) { W('_syncRecipientsFromContacts — aucun contact chargé'); return; }
    const selected = contacts
      .filter(c => c.mail && this.selectedContacts.has(c.contactId))
      .map(c => c.mail!);
    const contactEmails = new Set(contacts.map(c => c.mail).filter(Boolean));
    const manual = this.recipients.filter(r => !contactEmails.has(r));
    this.recipients = [...new Set([...selected, ...manual])];
    L('_syncRecipientsFromContacts — résultat: %o', this.recipients);
  }

  // ── Générer le message automatiquement ───────────────────────────────────
  buildMessage(): void {
    const d = this.detail();
    if (!d) { W('buildMessage — pas de détail facture'); return; }
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
    msg += `\n\nNB : Veuillez indiquer le numéro de facture (${d.billNumber}) lors de votre paiement afin d'en assurer un bon suivi.\n`;
    msg += `\nMerci pour votre confiance.\n\nCordialement,\n${this._providerName}`;
    this.body = msg;
    L('buildMessage — sujet: %s | corps: %d chars | impayés: %d', this.subject, msg.length, unpaid.length);
  }

  // ── Ouvrir la pièce jointe (PDF) ─────────────────────────────────────────
  openAttachment(): void {
    const d = this.detail();
    if (!d) { W('openAttachment — pas de détail'); return; }
    L('openAttachment — GET /api/bills/%d/file', d.billIdentifier);
    this.invoiceSvc.downloadFile(d.billIdentifier)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: blob => {
          L('PDF téléchargé: %d bytes', blob.size);
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 30_000);
        },
        error: err => {
          E('Erreur ouverture PDF', err.status, err.message);
          this.error.set('Impossible d\'ouvrir le PDF.');
        },
      });
  }

  // ── Pièces jointes additionnelles ─────────────────────────────────────────
  onExtraFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;

    for (const file of files) {
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
      if (!InvoiceSendComponent.ALLOWED_EXT.includes(ext)) {
        W('onExtraFileSelected — type refusé: %s (%s)', file.name, ext);
        this.error.set(`Type de fichier non autorisé (${ext}).`);
        continue;
      }
      this.extraAttachments.update(list => [...list, file]);
      L('Pièce jointe additionnelle ajoutée: %s (%d o)', file.name, file.size);
    }
    this.cdr.markForCheck();
  }

  removeExtraAttachment(file: File): void {
    this.extraAttachments.update(list => list.filter(f => f !== file));
    L('Pièce jointe additionnelle retirée: %s', file.name);
    this.cdr.markForCheck();
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
    if (!this._validEmail(email)) {
      W('Email invalide: %s', email);
      this.error.set(`Adresse invalide : ${email}`);
      return;
    }
    if (!this.recipients.includes(email)) {
      this.recipients = [...this.recipients, email];
      L('Email ajouté manuellement: %s | total: %d', email, this.recipients.length);
    }
    this.emailInput = '';
    this.error.set('');
    this.cdr.markForCheck();
  }

  removeRecipient(email: string): void {
    this.recipients = this.recipients.filter(r => r !== email);
    L('Destinataire retiré: %s | reste: %d', email, this.recipients.length);
    this.cdr.markForCheck();
  }

  private _validEmail(v: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  // ── Envoyer ───────────────────────────────────────────────────────────────
  send(): void {
    const d = this.detail();
    L('send() — détail: #%s | destinataires: %o | sujet: %s | corps: %d chars',
      d?.billIdentifier ?? 'NULL', this.recipients, this.subject, this.body?.length ?? 0);

    if (!d) {
      E('send() — aucune facture sélectionnée');
      return;
    }
    if (this.recipients.length === 0) {
      E('send() — aucun destinataire');
      this.error.set('Veuillez ajouter au moins un destinataire.');
      return;
    }
    if (!this.subject.trim()) {
      E('send() — sujet vide');
      this.error.set('Le sujet est requis.');
      return;
    }
    if (!this.body.trim()) {
      E('send() — corps vide');
      this.error.set('Le message est requis.');
      return;
    }

    L('send() — POST /api/bills/%d/send-email | vers: %o', d.billIdentifier, this.recipients);
    this.error.set('');
    this.success.set('');
    this.sending.set(true);

    this.invoiceSvc.sendEmail(d.billIdentifier, {
      recipients: this.recipients,
      subject:    this.subject,
      body:       this.body,
    }, this.extraAttachments()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        L('send() — ✓ succès: %s', res.message);
        this._sent = true;
        this.sending.set(false);
        this.success.set(res.message || 'Facture envoyée avec succès.');
        this.unsentBills.update(list => list.filter(b => b.billIdentifier !== d.billIdentifier));
        this.extraAttachments.set([]);
        this.selected.set(null);
        this.detail.set(null);
        this.cdr.markForCheck();
      },
      error: err => {
        E('send() — HTTP %d: %s', err.status, err?.error?.message ?? err.message);
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
