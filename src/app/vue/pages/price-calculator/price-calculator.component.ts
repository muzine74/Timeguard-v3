import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ConfigService } from '../../../state/config/config.service';
import { FREQUENCY_LABEL, PriceFrequency, PriceResult, PriceRow, VISITS_PER_LABEL, VisitFrequency, priceResult } from './price-calc';

/**
 * Calcul de prix d'un service de nettoyage : montant saisi (taxes incluses ou non) par visite ou par période,
 * nombre de visites et % d'achat → avant taxes, TPS, TVQ et total pour les périodes utiles, puis revenus annuels,
 * achat annuel et revenu net de la 1re année.
 * Calcul fait dans le navigateur ; seuls les taux de taxes viennent de la configuration de l'entreprise.
 */
@Component({
    selector: 'app-price-calculator',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './price-calculator.component.html',
    styleUrls: ['./price-calculator.component.scss']
})
export class PriceCalculatorComponent {
  private destroyRef = inject(DestroyRef);

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
      },
      error: () => { /* les taux par défaut restent affichés */ },
    });
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
