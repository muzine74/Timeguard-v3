import { Component, OnInit, signal, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CompanyService, CompanySummary } from '../../../state/compagny/Company.service';
import { InvoiceService, BillLine, BillCreatePayload } from '../../../state/invoice/invoice.service';
import { ConfigService } from '../../../state/config/config.service';
import { CompanyForm, SemainePlanning } from '../../../models';

interface PriceGroup {
  unitPrice: number;
  visits:    number;
  subtotal:  number;
}

interface CompanyPricing {
  groups:          PriceGroup[];
  totalPerPeriod:  number;
  visitsPerPeriod: number;
}

@Component({
  selector: 'app-invoice-generate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-generate.component.html',
  styleUrls: ['./invoice-generate.component.scss'],
})
export class InvoiceGenerateComponent implements OnInit {
  saved      = signal(false);
  sent       = signal(false);
  error      = signal('');
  saving     = signal(false);
  editId     = signal<number | null>(null);   // null = création, number = édition
  editNumber = signal('');                     // numéro affiché en mode édition

  // ── Compagnies ────────────────────────────────────────
  companies    = signal<CompanySummary[]>([]);
  coLoading    = signal(true);
  selectedCo   = signal<CompanySummary | null>(null);
  coSearch     = '';

  // ── Tarif de la compagnie sélectionnée ────────────────
  companyDetail  = signal<CompanyForm | null>(null);
  detailLoading  = signal(false);
  companyPricing = signal<CompanyPricing | null>(null);

  get filteredCompanies(): CompanySummary[] {
    const q = this.coSearch.toLowerCase();
    return q
      ? this.companies().filter(c => c.companyName.toLowerCase().includes(q))
      : this.companies();
  }

  // ── Formulaire facture ────────────────────────────────
  period        = this._currentPeriod();
  billedDate    = new Date().toISOString().split('T')[0];
  numberOfVisits = 0;
  note          = '';
  paymentInfo   = '';
  lines: BillLine[] = [];

  // ── Totaux calculés ───────────────────────────────────
  get subtotal(): number {
    return this.lines.reduce((s, l) => s + l.subTotal, 0);
  }
  private _tpsRate = 0.05;
  private _tvqRate = 0.09975;

  // Config fournisseur
  providerName    = '';
  providerAddress = '';
  providerPhone   = '';
  providerEmail   = '';
  tpsLabel        = 'TPS (5 %)';
  tvqLabel        = 'TVQ (9,975 %)';

  get tpsAmount(): number  { return +(this.subtotal * this._tpsRate).toFixed(2); }
  get tvqAmount(): number  { return +(this.subtotal * this._tvqRate).toFixed(2); }
  get totalTtc(): number   { return +(this.subtotal + this.tpsAmount + this.tvqAmount).toFixed(2); }

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[InvoiceGenerate]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[InvoiceGenerate]', ...a); }

  constructor(
    private companySvc:  CompanyService,
    private invoiceSvc:  InvoiceService,
    private configSvc:   ConfigService,
    private router:      Router,
    private route:       ActivatedRoute,
    private cdr:         ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.configSvc.get().subscribe({
      next: data => {
        const c = data.config;
        if (c.tpsRate) this._tpsRate = c.tpsRate / 100;
        if (c.tvqRate) this._tvqRate = c.tvqRate / 100;
        this.providerName    = c.companyName    ?? '';
        this.providerAddress = c.companyAddress ?? '';
        this.providerPhone   = c.companyPhone   ?? '';
        this.providerEmail   = c.companyEmail   ?? '';
        this.tpsLabel = c.tpsRate ? `TPS (${c.tpsRate} %)` : 'TPS (5 %)';
        this.tvqLabel = c.tvqRate ? `TVQ (${c.tvqRate} %)` : 'TVQ (9,975 %)';
        this.cdr.markForCheck();
      },
    });
    const params       = this.route.snapshot.queryParamMap;
    const preCompanyId = params.get('companyId');
    const prePeriod    = params.get('period');
    const preVisits    = params.get('visits');
    const editIdStr    = params.get('edit');

    if (prePeriod) this.period         = prePeriod;
    if (preVisits) this.numberOfVisits = parseInt(preVisits, 10) || 0;

    this.companySvc.getAll().subscribe({
      next: list => {
        const active = list.filter(c => c.isActive);
        this.companies.set(active);
        this.coLoading.set(false);

        if (editIdStr) {
          // Mode édition — charger la facture existante
          const id = parseInt(editIdStr, 10);
          this.editId.set(id);
          this.invoiceSvc.getById(id).subscribe({
            next: d => {
              this.editNumber.set(d.billNumber);
              this.period         = d.period;
              this.billedDate     = d.billedDate.split('T')[0];
              this.numberOfVisits = d.numberOfVisits;
              this.note           = d.note ?? '';
              this.paymentInfo    = d.paymentInfo ?? '';
              this.lines          = d.lines.map(l => ({ ...l, id: crypto.randomUUID() }));
              if (this.lines.length === 0) this.addLine();
              const match = active.find(c => c.companyId === d.companyCode || c.companyName === d.companyName);
              if (match) this.selectCompany(match);
            },
            error: () => { this.error.set('Impossible de charger la facture.'); this.addLine(); },
          });
        } else {
          if (preCompanyId) {
            const match = active.find(c => c.companyId === preCompanyId);
            if (match) this.selectCompany(match);
          }
          this.addLine();
        }
      },
      error: () => this.coLoading.set(false),
    });
  }

  selectCompany(co: CompanySummary): void {
    this.selectedCo.set(co);
    this.companyDetail.set(null);
    this.companyPricing.set(null);
    this.error.set('');
    this.saved.set(false);
    this.sent.set(false);

    this.detailLoading.set(true);
    this.companySvc.getById(co.companyId).subscribe({
      next: detail => {
        this.companyDetail.set(detail);
        this.companyPricing.set(this._computePricing(detail));
        this.detailLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => this.detailLoading.set(false),
    });
  }

  // ── Auto-remplir les lignes depuis le tarif ───────────
  autoFillFromPricing(): void {
    const pricing = this.companyPricing();
    if (!pricing || pricing.totalPerPeriod === 0) return;
    this.numberOfVisits = pricing.visitsPerPeriod;
    this.lines = pricing.groups.map(g => ({
      id:          crypto.randomUUID(),
      quantity:    g.visits,
      description: `Services de nettoyage — ${this.period}`,
      unitPrice:   g.unitPrice,
      subTotal:    g.subtotal,
    }));
    this.cdr.markForCheck();
  }

  // ── Calcul du tarif depuis le planning ────────────────
  private _computePricing(form: CompanyForm): CompanyPricing {
    const jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const;
    const priceMap = new Map<number, number>(); // unitPrice → visit count

    const collectSemaine = (s: SemainePlanning) => {
      jours.forEach(j => {
        const d = s[j];
        if (d?.actif) {
          const p = +d.compagnie;
          priceMap.set(p, (priceMap.get(p) ?? 0) + 1);
        }
      });
    };

    switch (form.frequenceTravail) {
      case 'hebdomadaire':
        collectSemaine(form.semaine1);
        break;
      case 'biHebdomadaire':
        collectSemaine(form.semaine1);
        collectSemaine(form.semaine2);
        break;
      case 'biMensuel':
        form.joursBiMensuel.forEach(j => {
          if (j.actif) {
            const p = +j.compagnie;
            priceMap.set(p, (priceMap.get(p) ?? 0) + 1);
          }
        });
        break;
      case 'mensuel':
        form.joursMensuel.forEach(j => {
          if (j.actif) {
            const p = +j.compagnie;
            priceMap.set(p, (priceMap.get(p) ?? 0) + 1);
          }
        });
        break;
    }

    const groups: PriceGroup[] = Array.from(priceMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([unitPrice, visits]) => ({
        unitPrice,
        visits,
        subtotal: +(unitPrice * visits).toFixed(2),
      }));

    const totalPerPeriod  = +groups.reduce((s, g) => s + g.subtotal, 0).toFixed(2);
    const visitsPerPeriod = groups.reduce((s, g) => s + g.visits, 0);

    return { groups, totalPerPeriod, visitsPerPeriod };
  }

  // ── Lignes ────────────────────────────────────────────
  addLine(): void {
    this.lines.push({ id: crypto.randomUUID(), quantity: 1, description: '', unitPrice: 0, subTotal: 0 });
  }

  removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.splice(i, 1);
  }

  recalcLine(i: number): void {
    const l = this.lines[i];
    l.subTotal = +(l.quantity * l.unitPrice).toFixed(2);
  }

  // ── Enregistrer ───────────────────────────────────────
  private _buildPayload(): BillCreatePayload {
    const co = this.selectedCo()!;
    return {
      companyName:    co.companyName,
      companyCode:    co.companyId,
      period:         this.period,
      billedDate:     this.billedDate,
      companyPrice:   this.subtotal,
      numberOfVisits: this.numberOfVisits,
      totalBeforeTax: this.subtotal,
      tps:            this.tpsAmount,
      tvq:            this.tvqAmount,
      totalWithTax:   this.totalTtc,
      note:           this.note,
      paymentInfo:    this.paymentInfo,
      lines:          this.lines,
    };
  }

  save(): void {
    if (!this.selectedCo()) { this.error.set('Sélectionnez une compagnie.'); return; }
    if (this.lines.every(l => !l.description.trim())) { this.error.set('Ajoutez au moins une ligne de description.'); return; }

    this.error.set('');
    this.saving.set(true);
    const id = this.editId();

    const obs = id
      ? this.invoiceSvc.update(id, this._buildPayload())
      : this.invoiceSvc.create(this._buildPayload());

    obs.subscribe({
      next: res => {
        this.log(id ? '✓ facture mise à jour' : '✓ facture créée:', res);
        this.saving.set(false);
        this.router.navigate(['/invoices']);
      },
      error: err => {
        this.warn('✕ save:', err);
        this.error.set(this.invoiceSvc.error() ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  // ── Enregistrer + marquer envoyée ────────────────────
  saveAndSend(): void {
    if (!this.selectedCo()) { this.error.set('Sélectionnez une compagnie.'); return; }
    if (this.lines.every(l => !l.description.trim())) { this.error.set('Ajoutez au moins une ligne de description.'); return; }

    this.error.set('');
    this.saving.set(true);
    this.invoiceSvc.create(this._buildPayload()).subscribe({
      next: res => {
        this.invoiceSvc.markSent(res.billIdentifier).subscribe({
          next: () => {
            this.log('✓ créée + envoyée:', res);
            this.saving.set(false);
            this.router.navigate(['/invoices']);
          },
          error: err => {
            this.warn('✕ markSent:', err);
            this.saving.set(false);
            this.saved.set(true); // facture créée quand même
          },
        });
      },
      error: err => {
        this.error.set(this.invoiceSvc.error() ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  // ── Imprimer / PDF ────────────────────────────────────
  printPreview(): void { window.print(); }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
