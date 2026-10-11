import { Component, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef, inject } from '@angular/core';
import {
  StatsService, StatsResponse, StatsCompanyRow, StatsInvoiceRow, StatsEmployeeRow, StatsPaymentStatus, PAYMENT_STATUS_LABEL,
  StatsBillingComparisonRow,
} from '../../../state/stats/stats.service';
import { TableSort, SortValue } from '../../shared/table-sort';
import { todayIso } from '../../shared/dates';
import { ExportButtonsComponent } from '../../components/export-buttons/export-buttons.component';
import { ExportDoc, ExportRow, TableExportService } from '../../../state/export/table-export.service';
import { httpErrorMessage } from '../../shared/http-error';
import { MultiSelectComponent, MultiSelectOption } from '../../components/multi-select/multi-select.component';

type FilterMode = 'period' | 'range';
type StatutFilter = 'facturee' | 'nonpayee' | 'payee';
type StatsView = 'global' | 'comptable' | 'banque' | 'facturation';

type InvoiceSortKey = 'num' | 'period' | 'date' | 'visits' | 'ht' | 'tps' | 'tvq' | 'status' | 'ttc';
const AMOUNT: Partial<Record<InvoiceSortKey, 'totalHT' | 'totalTPS' | 'totalTVQ' | 'totalTTC'>> =
  { ht: 'totalHT', tps: 'totalTPS', tvq: 'totalTVQ', ttc: 'totalTTC' };

/** Compagnie avec ses factures retenues par le filtre de statut. */
export interface CompanyGroup {
  key:      string;
  company:  StatsCompanyRow;
  invoices: StatsInvoiceRow[];
  total:    number;
}

const EMPTY_ID = '00000000-0000-0000-0000-000000000000';

@Component({
    selector: 'app-stats',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, ExportButtonsComponent, MultiSelectComponent],
    templateUrl: './stats.component.html',
    styleUrls: ['./stats.component.scss']
})
export class StatsComponent {
  // ── Filtres ───────────────────────────────────────────────────────────────
  mode: FilterMode = 'period';

  // Mode période (YYYY-MM)
  period = this._currentPeriod();

  // Mode intervalle
  dateFrom = todayIso();
  dateTo   = todayIso();

  // ── État ──────────────────────────────────────────────────────────────────
  loading      = signal(false);
  error        = signal('');
  stats        = signal<StatsResponse | null>(null);
  regrouper    = signal(false);
  statutFilter = signal<StatutFilter>('facturee');

  private destroyRef = inject(DestroyRef);

  constructor(
    private statsSvc: StatsService,
    private cdr:      ChangeDetectorRef,
  ) {}

  // ── Calculé ───────────────────────────────────────────────────────────────

  /** Groupes repliés par défaut : clés des compagnies dépliées. */
  expanded = signal<ReadonlySet<string>>(new Set());

  // ── Filtres de la colonne « Compagnie » : un par tableau, indépendants (aucune cochée = toutes) ──
  /** Factures par compagnie (clé du groupe). */
  invCompanies  = signal<string[]>([]);
  /** Registre bancaire, Factures payées (nom de la compagnie : la ligne n'a pas d'identifiant). */
  paidCompanies = signal<string[]>([]);
  /** Comparaison de facturation, Par compagnie (clé de la ligne). */
  cmpCompanies  = signal<string[]>([]);

  private _options(items: { id: string; label: string }[]): MultiSelectOption[] {
    const byId = new Map(items.map(i => [i.id, { id: i.id, label: i.label || '—' }]));
    return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));
  }

  invCompanyOptions  = computed(() => this._options((this.stats()?.parCompagnie ?? []).map(c => ({ id: this.groupKey(c), label: c.companyName }))));
  paidCompanyOptions = computed(() => this._options((this.stats()?.banqueFacturesPayees ?? []).map(i => ({ id: i.companyName, label: i.companyName }))));
  cmpCompanyOptions  = computed(() => this._options((this.stats()?.comparaisonFacturation ?? []).map(r => ({ id: this.cmpKey(r), label: r.companyName }))));

  cmpKey(r: StatsBillingComparisonRow): string { return r.companyId && r.companyId !== EMPTY_ID ? r.companyId : '?' + r.companyName; }

  /** Factures payées du registre bancaire retenues par le filtre de la colonne Compagnie, avec leur total. */
  paidInvoices = computed(() => {
    const kept = this.paidCompanies();
    const rows = (this.stats()?.banqueFacturesPayees ?? []).filter(i => !kept.length || kept.includes(i.companyName));
    const sum = (k: 'totalHT' | 'totalTTC') => this._round2(rows.reduce((t, i) => t + i[k], 0));
    return { rows, ht: sum('totalHT'), ttc: sum('totalTTC') };
  });

  /** Lignes « Par compagnie » de la comparaison retenues par le filtre de la colonne Compagnie. */
  cmpRows = computed(() => {
    const kept = this.cmpCompanies();
    return (this.stats()?.comparaisonFacturation ?? []).filter(r => !kept.length || kept.includes(this.cmpKey(r)));
  });

  /** Un nouveau calcul peut ne plus contenir une compagnie cochée : elle est retirée du filtre. */
  private _pruneColumnFilters(): void {
    const keep = (selected: string[], options: MultiSelectOption[]) => selected.filter(id => options.some(o => o.id === id));
    this.invCompanies.set(keep(this.invCompanies(), this.invCompanyOptions()));
    this.paidCompanies.set(keep(this.paidCompanies(), this.paidCompanyOptions()));
    this.cmpCompanies.set(keep(this.cmpCompanies(), this.cmpCompanyOptions()));
  }

  /**
   * Factures retenues par le filtre de statut et par le filtre de la colonne Compagnie, regroupées par compagnie.
   * Un avoir suit le statut de sa facture d'origine (il en réduit le montant dû).
   */
  groups = computed<CompanyGroup[]>(() => {
    const statut = this.statutFilter();
    const kept = this.invCompanies();
    return (this.stats()?.parCompagnie ?? []).filter(c => !kept.length || kept.includes(this.groupKey(c))).map(company => {
      const factures = company.factures ?? [];
      const paidById = new Map(factures.map(f => [f.billIdentifier, f.isPaid]));
      const invoices = factures.filter(f => {
        if (statut === 'facturee') return true;
        const paid = f.isAvoir && f.parentBillIdentifier != null && paidById.has(f.parentBillIdentifier)
          ? paidById.get(f.parentBillIdentifier)!
          : f.isPaid;
        return statut === 'payee' ? paid : !paid;
      });
      return { key: this.groupKey(company), company, invoices, total: this._sum(invoices, 'totalTTC') };
    }).filter(g => g.invoices.length > 0);
  });

  /** Tri au clic sur l'en-tête : factures triées dans chaque compagnie, compagnies triées
   *  par leur total de la colonne (montants, visites), leur nom (1re colonne) ou leur 1re facture. */
  readonly sort = new TableSort<InvoiceSortKey>(['date', 'visits', 'ht', 'tps', 'tvq', 'ttc']);

  sortedGroups = computed<CompanyGroup[]>(() => {
    const key = this.sort.key();
    const groups = this.groups();
    if (!key) return groups;
    const withInvoices = groups.map(g => ({ ...g, invoices: this.sort.apply(g.invoices, (f, k) => this._invoiceValue(f, k)) }));
    return this.sort.apply(withInvoices, (g, k) => {
      if (k === 'num') return g.company.companyName;
      if (k === 'visits') return g.invoices.filter(f => !f.isAvoir).reduce((s, f) => s + f.nbVisites, 0);
      const amount = AMOUNT[k];
      if (amount) return k === 'ttc' ? g.total : this._sum(g.invoices, amount);
      return g.invoices.length ? this._invoiceValue(g.invoices[0], k) : null;
    });
  });

  private _invoiceValue(f: StatsInvoiceRow, k: InvoiceSortKey): SortValue {
    switch (k) {
      case 'num':    return f.billNumber;
      case 'period': return f.period;
      case 'date':   return f.billedDate;
      case 'visits': return f.isAvoir ? null : f.nbVisites;
      case 'status': return this.invoiceStatus(f);
      default:       return f[AMOUNT[k]!];
    }
  }

  private _shown = computed(() => this.groups().flatMap(g => g.invoices));
  totalCount = computed(() => this._shown().length);
  totalHT    = computed(() => this._sum(this._shown(), 'totalHT'));
  totalTPS   = computed(() => this._sum(this._shown(), 'totalTPS'));
  totalTVQ   = computed(() => this._sum(this._shown(), 'totalTVQ'));
  totalTTC   = computed(() => this._sum(this._shown(), 'totalTTC'));
  totalVisites = computed(() => this._shown().filter(f => !f.isAvoir).reduce((s, f) => s + f.nbVisites, 0));
  allExpanded  = computed(() => this.groups().length > 0 && this.groups().every(g => this.expanded().has(g.key)));

  private _sum(rows: StatsInvoiceRow[], k: 'totalHT' | 'totalTPS' | 'totalTVQ' | 'totalTTC'): number {
    return Math.round(rows.reduce((s, r) => s + r[k], 0) * 100) / 100;
  }

  groupKey(c: StatsCompanyRow): string { return c.companyId && c.companyId !== EMPTY_ID ? c.companyId : c.companyCode; }
  trackGroup(_: number, g: CompanyGroup) { return g.key; }
  trackInvoice(_: number, f: StatsInvoiceRow) { return f.billIdentifier; }

  isOpen(key: string): boolean { return this.expanded().has(key); }

  toggle(key: string): void {
    const next = new Set(this.expanded());
    next.has(key) ? next.delete(key) : next.add(key);
    this.expanded.set(next);
  }

  toggleAll(): void {
    this.expanded.set(this.allExpanded() ? new Set() : new Set(this.groups().map(g => g.key)));
  }

  invoiceStatus(f: StatsInvoiceRow): string {
    if (f.isAvoir) return 'Avoir';
    if (f.isPaid)  return 'Payée';
    return f.isSent ? 'Envoyée' : 'Non envoyée';
  }

  // ── Exports (ce qui est affiché : filtre de statut et tri appliqués, groupes tous dépliés) ──
  private _exportSubtitle(): string {
    return `Période : ${this.periodeLabel()}`;
  }

  exportEmployees = (): ExportDoc => {
    const s = this.stats()!;
    return {
      fileName: TableExportService.fileName('Paiements_employes', this.periodeLabel()),
      title: 'Statistiques',
      subtitle: this._exportSubtitle(),
      tables: [{
        title: 'Paiements employés',
        columns: [{ header: 'Employé', width: 32 }, { header: 'Visites', type: 'int' }, { header: 'Paiement', type: 'money' },
                  { header: 'Statut du paiement', width: 20 }],
        rows: [
          ...s.parEmploye.map(r => ({ cells: [r.employeeName, r.nbVisites, r.totalPaiementEmploye, this.payStatusLabel(r)] })),
          { kind: 'total', cells: ['Total', s.nbVisitesTotal, s.totalPaiementsEmployes, ''] },
        ],
      }],
    };
  };

  exportInvoices = (): ExportDoc => {
    const rows: ExportRow[] = [];
    for (const g of this.sortedGroups()) {
      const n = g.invoices.length;
      rows.push({ kind: 'group', cells: [
        `${g.company.companyName || '—'} (${n} facture${n > 1 ? 's' : ''})`, '', '',
        g.invoices.filter(f => !f.isAvoir).reduce((t, f) => t + f.nbVisites, 0),
        this._sum(g.invoices, 'totalHT'), this._sum(g.invoices, 'totalTPS'), this._sum(g.invoices, 'totalTVQ'), '', g.total,
      ] });
      for (const f of g.invoices) {
        rows.push({ kind: 'detail', cells: [
          f.billNumber, f.period, (f.billedDate ?? '').slice(0, 10), f.isAvoir ? null : f.nbVisites,
          f.totalHT, f.totalTPS, f.totalTVQ, this.invoiceStatus(f), f.totalTTC,
        ] });
      }
    }
    const nc = this.groups().length, nf = this.totalCount();
    rows.push({ kind: 'total', cells: [
      `Total : ${nc} compagnie${nc > 1 ? 's' : ''}, ${nf} facture${nf > 1 ? 's' : ''}`, '', '', this.totalVisites(),
      this.totalHT(), this.totalTPS(), this.totalTVQ(), '', this.totalTTC(),
    ] });
    return {
      fileName: TableExportService.fileName('Factures_par_compagnie', this.statutLabel(), this.periodeLabel()),
      title: 'Statistiques',
      subtitle: `${this._exportSubtitle()} — factures : ${this.statutLabel()}`
        + (this.invCompanies().length ? ` — compagnies : ${this.groups().map(g => g.company.companyName || '—').join(', ')}` : ''),
      landscape: true,
      tables: [{
        title: 'Factures par compagnie',
        columns: [
          { header: 'Compagnie / N° facture', width: 36 }, { header: 'Période', width: 10 }, { header: 'Émise le', width: 12 },
          { header: 'Visites', type: 'int' }, { header: 'Total HT', type: 'money' }, { header: 'TPS', type: 'money' },
          { header: 'TVQ', type: 'money' }, { header: 'Statut', width: 13 }, { header: 'Total TTC', type: 'money' },
        ],
        rows,
      }],
    };
  };

  // ── Cartes : toutes calculées par l'API sur la période / l'intervalle choisi
  //    (le filtre de statut ne concerne que le tableau des factures) ──
  cards = computed(() => {
    const s = this.stats();
    if (!s) return [];
    const n = s.nbPlanningIncomplet;
    const empTax = ' Taxes selon le profil de chaque employé (numéro TPS / TVQ).';
    return [
      { key: 'theorique', label: 'Total théorique à facturer', color: 'card-blue', ht: s.totalTheoriqueHT, ttc: s.totalTheoriqueTTC,
        note: 'Selon le planning des compagnies actives.' + (n > 0
          ? ` ${n} compagnie${n > 1 ? 's' : ''} non comptée${n > 1 ? 's' : ''} (bi-hebdo sans date de début).` : '') },
      { key: 'envoyees', label: 'Total des factures envoyées', color: 'card-gray', ht: s.totalEnvoyeHT, ttc: s.totalEnvoyeTTC, note: 'Avoirs déduits.' },
      { key: 'paye', label: 'Total payé', color: 'card-green', ht: s.totalPayeHT, ttc: s.totalPaye, note: 'Factures de la période déjà payées.' },
      { key: 'attente', label: 'Total en attente de paiement', color: 'card-orange', ht: s.totalEnAttenteHT, ttc: s.totalEnAttente, note: 'Factures de la période non payées.' },
      { key: 'charges', label: 'Charges employés', color: 'card-purple', ht: s.chargesEmployes, ttc: s.chargesEmployesTTC,
        note: 'Paie de tous les pointages de la période.' + empTax },
      { key: 'aeffectuer', label: 'Paiements employés à effectuer', color: 'card-gray', ht: s.paiementsEmployesAEffectuer, ttc: s.paiementsEmployesAEffectuerTTC,
        note: 'Montant qui devrait être payé : semaines validées.' + empTax },
      { key: 'effectues', label: 'Paiements employés effectués', color: 'card-green', ht: s.paiementsEmployesEffectues, ttc: s.paiementsEmployesEffectuesTTC,
        note: 'Paiements marqués « transférés » dans Paiements employés.' + empTax },
    ];
  });

  /**
   * Change le filtre de statut des factures sans faire sauter la page : la section garde au moins sa hauteur
   * actuelle (un tableau plus court raccourcirait la page, et le navigateur remonterait l'affichage).
   * La hauteur réservée est libérée au prochain calcul (la section est alors recréée).
   */
  setStatut(statut: StatutFilter, section: HTMLElement): void {
    if (this.statutFilter() === statut) return;
    section.style.minHeight = `${section.offsetHeight}px`;
    this.statutFilter.set(statut);
  }

  // ── Sous-pages (onglets) : mêmes filtres et mêmes données, seule la vue change ──
  readonly views: { id: StatsView; label: string }[] = [
    { id: 'global',      label: '📊 Global' },
    { id: 'comptable',   label: '📒 Registre comptable' },
    { id: 'banque',      label: '🏦 Registre bancaire' },
    { id: 'facturation', label: '⚖ Comparaison de facturation' },
  ];
  view = signal<StatsView>('global');

  /** Flèches gauche / droite entre les onglets. */
  onTabKey(ev: KeyboardEvent): void {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    const i = this.views.findIndex(v => v.id === this.view());
    const next = this.views[(i + (ev.key === 'ArrowRight' ? 1 : this.views.length - 1)) % this.views.length];
    this.view.set(next.id);
    setTimeout(() => document.getElementById('stats-tab-' + next.id)?.focus());
  }

  // ── Registre bancaire : lignes du relevé chargé, datées dans la période ──
  bank = computed(() => {
    const s = this.stats();
    if (!s) return null;
    const deposits = s.banqueDepots ?? 0, withdrawals = s.banqueRetraits ?? 0;
    const invoices = s.banqueFacturesPayees ?? [], payments = s.banquePaiements ?? [], charges = s.banqueCharges ?? [];
    const sum = (rows: number[]) => this._round2(rows.reduce((t, n) => t + n, 0));
    const received = sum(invoices.map(i => i.totalTTC));
    const paid     = sum(payments.map(p => p.total));
    const spent    = sum(charges.map(c => c.total));
    return { invoices, payments, charges, received, paid, spent, balance: this._round2(received - paid - spent),
             paidHT: sum(payments.map(p => p.amountHT)), paidTaxes: sum(payments.map(p => p.taxes)), receivedHT: sum(invoices.map(i => i.totalHT)),
             // Relevé bancaire chargé (lignes datées dans la période) : pour recouper
             deposits, withdrawals, net: this._round2(deposits - withdrawals),
             count: s.banqueNbTransactions ?? 0, validated: s.banqueNbValidees ?? 0 };
  });

  // ── Comparaison de facturation : théorique à facturer / factures envoyées (mêmes montants que les cartes) ──
  billing = computed(() => {
    const s = this.stats();
    if (!s) return null;
    const row = (label: string, theorique: number, envoye: number) => ({
      label, theorique, envoye, ecart: this._round2(theorique - envoye),
      pct: theorique > 0 ? Math.round(envoye / theorique * 1000) / 10 : null,
    });
    const rows = [row('Sans taxes', s.totalTheoriqueHT, s.totalEnvoyeHT), row('Avec taxes', s.totalTheoriqueTTC, s.totalEnvoyeTTC)];
    const ecart = rows[0].ecart;
    const status: 'ok' | 'reste' | 'depasse' = ecart === 0 ? 'ok' : ecart > 0 ? 'reste' : 'depasse';
    const statusLabel = status === 'ok' ? 'Tout le théorique est facturé'
      : status === 'reste' ? `Reste à facturer : ${this.fmt(ecart)} (sans taxes)`
      : `Facturé au-delà du théorique : ${this.fmt(-ecart)} (sans taxes)`;
    return { rows, status, statusLabel };
  });

  /** Compagnies dont les factures envoyées égalent le théorique. */
  sameCount = computed(() => this.cmpRows().filter(r => r.ecart === 0).length);

  private _round2(n: number): number { return Math.round(n * 100) / 100; }

  // ── Statut du paiement d'un employé (calculé par l'API : montant transféré / paie de la période) ──
  payStatus(row: StatsEmployeeRow): StatsPaymentStatus { return row.statutPaiement ?? 'nonpaye'; }
  payStatusLabel(row: StatsEmployeeRow): string { return PAYMENT_STATUS_LABEL[this.payStatus(row)]; }
  payStatusTitle(row: StatsEmployeeRow): string {
    return `Transféré ${this.fmt(row.montantTransfere ?? 0)} sur ${this.fmt(row.totalPaiementEmploye)} (avant taxes)`;
  }

  // ── Recalcul automatique quand la période change ─────────────────────────
  private _autoTimer: ReturnType<typeof setTimeout> | null = null;

  setMode(m: FilterMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.autoLoad();
  }

  /** Relance le calcul (avec un court délai pendant la saisie) dès que les dates sont complètes et valides. */
  autoLoad(): void {
    if (this._autoTimer) clearTimeout(this._autoTimer);
    this._autoTimer = setTimeout(() => {
      this._autoTimer = null;
      const ok = this.mode === 'period'
        ? /^\d{4}-\d{2}$/.test(this.period ?? '')
        : !!this.dateFrom && !!this.dateTo && this.dateFrom <= this.dateTo;
      if (ok) this.load();
      else if (this.mode === 'range' && this.dateFrom && this.dateTo) this.error.set('La date de début doit être avant la date de fin.');
    }, 400);
  }

  // ── Chargement ────────────────────────────────────────────────────────────
  load(): void {
    this.error.set('');
    this.stats.set(null);
    this.expanded.set(new Set());

    if (this.mode === 'period') {
      if (!this.period) { this.error.set('Sélectionnez une période.'); return; }
      this._fetch(this.statsSvc.getByPeriod(this.period));
    } else {
      if (!this.dateFrom || !this.dateTo) { this.error.set('Sélectionnez les deux dates.'); return; }
      if (this.dateFrom > this.dateTo)    { this.error.set('La date de début doit être avant la date de fin.'); return; }
      this._fetch(this.statsSvc.getByRange(this.dateFrom, this.dateTo));
    }
  }

  private _fetch(obs: ReturnType<StatsService['getByPeriod']>): void {
    this.loading.set(true);
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.stats.set(data);
        this._pruneColumnFilters();
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(httpErrorMessage(err));
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  periodeLabel(): string {
    const s = this.stats();
    if (!s) return '';
    if (s.dateDebut === s.dateFin) return s.dateDebut;
    return `${s.dateDebut} → ${s.dateFin}`;
  }

  statutLabel(): string {
    switch (this.statutFilter()) {
      case 'payee':    return 'Payée';
      case 'nonpayee': return 'Non payée';
      default:         return 'Facturée';
    }
  }

  // ── Navigation détail (nouvel onglet) ────────────────────────────────────
  private _rangeQuery(): string {
    return this.mode === 'period'
      ? `period=${encodeURIComponent(this.period)}`
      : `from=${encodeURIComponent(this.dateFrom)}&to=${encodeURIComponent(this.dateTo)}`;
  }

  /** Détail du calcul d'une carte, sur la même période. */
  cardUrl(key: string): string { return `/stats/card/${key}?${this._rangeQuery()}`; }

  openEmployee(row: { employeeId: string }): void {
    window.open(`/stats/employee/${row.employeeId}?${this._rangeQuery()}`, '_blank');
  }

  canOpenCompany(row: StatsCompanyRow): boolean { return !!row.companyId && row.companyId !== EMPTY_ID; }

  openCompany(row: StatsCompanyRow): void {
    if (!this.canOpenCompany(row)) return;
    window.open(`/stats/company/${row.companyId}?${this._rangeQuery()}`, '_blank');
  }
}
