import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfigService } from '../../../state/config/config.service';
import { FREQUENCY_LABEL, PriceFrequency, PriceResult, PriceRow, VISITS_PER_LABEL, VisitFrequency, priceResult, TaxField, TaxSplit, taxSplit } from './price-calc';

/**
 * Deux sous-pages (onglets) : « Calcul de prix » (/prix) et « Calculateur de taxes » (/prix/taxes), choisies par la route.
 *
 * Calcul de prix d'un service de nettoyage : montant saisi (taxes incluses ou non) par visite ou par période,
 * nombre de visites et % d'achat → avant taxes, TPS, TVQ et total pour les périodes utiles, puis revenus annuels,
 * achat annuel et revenu net de la 1re année.
 * Calcul fait dans le navigateur ; seuls les taux de taxes viennent de la configuration de l'entreprise.
 */
@Component({
    selector: 'app-price-calculator',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
    templateUrl: './price-calculator.component.html',
    styleUrls: ['./price-calculator.component.scss']
})
export class PriceCalculatorComponent {
  private destroyRef = inject(DestroyRef);
  /** Sous-page affichée : calcul de prix ou calculateur de taxes. */
  readonly view: 'price' | 'tax' = inject(ActivatedRoute).snapshot.data['view'] === 'tax' ? 'tax' : 'price';

  readonly frequencies: { id: PriceFrequency; label: string }[] =
    (['visit', 'weekly', 'biweekly', 'monthly', 'yearly'] as PriceFrequency[]).map(id => ({ id, label: FREQUENCY_LABEL[id] }));
  /** Rythme des visites : indépendant de la fréquence du montant, toutes les combinaisons sont permises. */
  readonly visitFrequencies: { id: VisitFrequency; label: string }[] =
    (['weekly', 'biweekly', 'monthly', 'yearly'] as VisitFrequency[]).map(id => ({ id, label: FREQUENCY_LABEL[id] }));

  // ── Entrées ───────────────────────────────────────────────────────────────
  amount      = signal<number | null>(null);
  taxIncluded = signal(false);
  frequency   = signal<PriceFrequency>('weekly');
  visits      = signal<number | null>(1);
  visitFrequency = signal<VisitFrequency>('weekly');
  purchasePercent = signal<number | null>(null);

  // Taux de la configuration de l'entreprise ; taux du Québec tant qu'elle n'est pas chargée
  tpsRate = signal(5);
  tvqRate = signal(9.975);

  constructor(configSvc: ConfigService) {
    configSvc.get().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (data.config?.tpsRate > 0) this.tpsRate.set(data.config.tpsRate);
        if (data.config?.tvqRate > 0) this.tvqRate.set(data.config.tvqRate);
        this._recalcTax();   // les taux de l'entreprise remplacent ceux du Québec : le calculateur suit
      },
      error: () => { /* les taux par défaut restent affichés */ },
    });
  }

  // ── Calculateur de taxes : saisir l'un des trois montants calcule les deux autres ──
  /** Valeurs affichées dans les trois champs ; celle du champ saisi reste telle que tapée. */
  taxHt    = signal<number | null>(null);
  taxTaxes = signal<number | null>(null);
  taxTtc   = signal<number | null>(null);
  /** Détail TPS / TVQ du dernier calcul (null si rien à calculer). */
  taxDetail = signal<TaxSplit | null>(null);
  private _taxField: TaxField | null = null;

  /** Saisie dans l'un des trois champs : les deux autres sont recalculés, celui-ci n'est pas réécrit. */
  onTaxInput(field: TaxField, v: number | null): void {
    this._taxField = field;
    ({ ht: this.taxHt, taxes: this.taxTaxes, ttc: this.taxTtc })[field].set(this._number(v));
    this._recalcTax();
  }

  clearTax(): void {
    this._taxField = null;
    this.taxHt.set(null); this.taxTaxes.set(null); this.taxTtc.set(null); this.taxDetail.set(null);
  }

  private _recalcTax(): void {
    const field = this._taxField;
    if (!field) return;
    const value = ({ ht: this.taxHt, taxes: this.taxTaxes, ttc: this.taxTtc })[field]();
    const split = value === null ? null : taxSplit(field, value, this.tpsRate(), this.tvqRate());
    this.taxDetail.set(split);
    // Champ vide ou valeur impossible : les deux autres se vident (pas d'ancien résultat trompeur)
    if (field !== 'ht')    this.taxHt.set(split?.ht ?? null);
    if (field !== 'taxes') this.taxTaxes.set(split?.taxes ?? null);
    if (field !== 'ttc')   this.taxTtc.set(split?.ttc ?? null);
  }

  // ── Résultat ──────────────────────────────────────────────────────────────
  result = computed<PriceResult | null>(() => this.hint() ? null : priceResult({
    amount: this.amount() ?? 0, taxIncluded: this.taxIncluded(), frequency: this.frequency(),
    visits: this.visits() ?? 0, visitFrequency: this.visitFrequency(), purchasePercent: this.purchasePercent() ?? 0,
    tpsRate: this.tpsRate(), tvqRate: this.tvqRate(),
  }));

  /** Ce qui manque pour calculer, ou chaîne vide. */
  hint = computed(() => {
    const a = this.amount(), v = this.visits(), p = this.purchasePercent();
    if (a === null) return 'Saisissez un montant pour voir le calcul.';
    if (!(a > 0)) return 'Le montant doit être supérieur à 0.';
    if (v === null || !(v > 0)) return 'Le nombre de visites doit être supérieur à 0.';
    if (p !== null && p < 0) return 'Le pourcentage d\'achat ne peut pas être négatif.';
    return '';
  });

  /** « par semaine », « par mois »… : période sur laquelle les visites sont comptées. */
  visitsPer = computed(() => VISITS_PER_LABEL[this.visitFrequency()]);

  /** Comment les revenus annuels sont obtenus, selon la fréquence du montant. */
  amountHelp = computed(() => this.frequency() === 'visit'
    ? 'Revenus annuels = prix d\'une visite × nombre de visites par année.'
    : 'Revenus annuels = montant × nombre de périodes par année. Les visites ne changent pas les revenus : elles donnent le prix d\'une visite.');

  /** « 4 visites par semaine » — rappel du rythme saisi. */
  visitsLabel = computed(() => {
    const v = this.visits() ?? 0;
    return `${this.num(v)} visite${v > 1 ? 's' : ''} ${this.visitsPer()}`;
  });

  private _number(v: number | null): number | null { return v === null || Number.isNaN(v) ? null : v; }
  setAmount(v: number | null): void   { this.amount.set(this._number(v)); }
  setVisits(v: number | null): void   { this.visits.set(this._number(v)); }
  setPurchase(v: number | null): void { this.purchasePercent.set(this._number(v)); }

  trackRow(_: number, r: PriceRow): string { return r.key; }

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  num(val: number): string { return val.toLocaleString('fr-CA', { maximumFractionDigits: 3 }); }
}
