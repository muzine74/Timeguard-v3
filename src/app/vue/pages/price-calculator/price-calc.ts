/** Calcul de prix d'un service de nettoyage : un montant, à une fréquence, ramené aux périodes utiles et à l'année. */

/** Fréquence du MONTANT (facturation) : prix d'une visite, ou prix d'une période. */
export type PriceFrequency = 'visit' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
/** Fréquence des VISITES : « 3 visites par semaine », « 2 visites par mois »… Indépendante de celle du montant. */
export type VisitFrequency = Exclude<PriceFrequency, 'visit'>;
export type PriceRowKey = PriceFrequency | 'revenue' | 'purchase' | 'net';

export interface PriceInput {
  /** Montant saisi : prix d'UNE visite, ou d'UNE période de la fréquence du montant. */
  amount:      number;
  /** Vrai : le montant saisi contient déjà la TPS et la TVQ. */
  taxIncluded: boolean;
  frequency:   PriceFrequency;
  /** Nombre de visites par période de `visitFrequency`. */
  visits:      number;
  visitFrequency: VisitFrequency;
  /** Pourcentage d'achat appliqué aux revenus annuels (0 = aucun achat). */
  purchasePercent: number;
  /** Taux en pourcentage (5 et 9,975 par défaut). */
  tpsRate:     number;
  tvqRate:     number;
}

export interface PriceRow {
  key:   PriceRowKey;
  label: string;
  /** Vrai pour la ligne de la fréquence du montant : c'est le montant saisi. */
  entered: boolean;
  ht:  number;
  tps: number;
  tvq: number;
  ttc: number;
}

export interface PriceResult {
  /** Périodes utiles, de la plus courte à l'année, sans doublon. */
  rows: PriceRow[];
  /** Toujours trois lignes : revenus annuels, achat annuel, revenu net de la 1re année. */
  purchase: PriceRow[];
  visitsPerYear: number;
}

export const FREQUENCY_LABEL: Record<PriceFrequency, string> =
  { visit: 'Par visite', weekly: 'Hebdomadaire', biweekly: 'Toutes les 2 semaines', monthly: 'Mensuelle', yearly: 'Annuelle' };

/** « 3 visites par semaine » : suite de la phrase pour chaque fréquence de visites. */
export const VISITS_PER_LABEL: Record<VisitFrequency, string> =
  { weekly: 'par semaine', biweekly: 'par 2 semaines', monthly: 'par mois', yearly: 'par année' };

const ROW_LABEL: Record<PriceFrequency, string> =
  { visit: 'Par visite', weekly: 'Par semaine', biweekly: 'Par 2 semaines', monthly: 'Par mois', yearly: 'Par année' };

/** Nombre de périodes dans une année. */
export const PERIODS_PER_YEAR: Record<VisitFrequency, number> = { weekly: 52, biweekly: 26, monthly: 12, yearly: 1 };

/** Lignes affichées à partir d'une période : elle-même puis les plus longues (« par 2 semaines » seulement si elle est choisie). */
const ROWS_FROM: Record<VisitFrequency, VisitFrequency[]> = {
  weekly:   ['weekly', 'monthly', 'yearly'],
  biweekly: ['biweekly', 'monthly', 'yearly'],
  monthly:  ['monthly', 'yearly'],
  yearly:   ['yearly'],
};

// Arrondi au cent, demi-cent vers le haut. Passe d'abord par 8 décimales : 300 × 0,09975 vaut 29,924999… en
// virgule flottante alors que le montant exact est 29,925 (→ 29,93).
const round2 = (n: number) => Math.round(Math.round(n * 1e8) / 1e6) / 100;

/**
 * Revenus annuels (avant taxes) selon la fréquence du MONTANT :
 *  - prix par visite : prix × nombre de visites par année ;
 *  - prix par période : prix × nombre de périodes par année — le rythme des visites n'y change rien.
 */
export function yearlyRevenue(amountHt: number, frequency: PriceFrequency, visitsPerYear: number): number {
  return frequency === 'visit' ? amountHt * visitsPerYear : amountHt * PERIODS_PER_YEAR[frequency];
}

/**
 * La TPS et la TVQ sont calculées chacune sur le montant avant taxes (la TVQ ne s'applique pas sur la TPS).
 * Renvoie null si le montant ou le nombre de visites n'est pas valide.
 */
export function priceResult(input: PriceInput): PriceResult | null {
  const { amount, visits, frequency, visitFrequency } = input;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(visits) || visits <= 0) return null;
  const tps = Math.max(0, input.tpsRate) / 100, tvq = Math.max(0, input.tvqRate) / 100;

  // Montant avant taxes saisi
  // (459,90 / 1,14975 donne 399,99999999999994 en virgule flottante : remis à 400 avant d'arrondir les taxes au cent)
  const enteredHt = input.taxIncluded ? Math.round(amount / (1 + tps + tvq) * 1e8) / 1e8 : amount;

  const visitsPerYear = visits * PERIODS_PER_YEAR[visitFrequency];
  const yearHt = yearlyRevenue(enteredHt, frequency, visitsPerYear);
  const exactHt: Record<PriceFrequency, number> = {
    visit: yearHt / visitsPerYear, weekly: yearHt / 52, biweekly: yearHt / 26, monthly: yearHt / 12, yearly: yearHt,
  };

  const row = (key: PriceRowKey, label: string, ht0: number, entered = false): PriceRow => {
    if (entered && input.taxIncluded) {
      // Le montant saisi reste exact au cent près : c'est le « avant taxes » qui absorbe l'arrondi
      const t = round2(ht0 * tps), q = round2(ht0 * tvq), ttc = round2(amount);
      return { key, label, entered, ht: round2(ttc - t - q), tps: t, tvq: q, ttc };
    }
    const ht = round2(ht0), t = round2(ht0 * tps), q = round2(ht0 * tvq);
    return { key, label, entered, ht, tps: t, tvq: q, ttc: round2(ht + t + q) };
  };

  // Périodes affichées : à partir de celle des visites (prix par visite) ou de celle du montant (prix par période).
  // Une visite et une période qui reviennent aussi souvent dans l'année ont le même montant : une seule des deux
  // lignes est gardée, celle du montant saisi. Les lignes vont de la plus fréquente à l'année.
  const perYear = (k: PriceFrequency) => k === 'visit' ? visitsPerYear : PERIODS_PER_YEAR[k];
  // Départ : la plus courte des deux périodes (montant annuel + visites mensuelles → le mois est affiché ;
  // montant mensuel + visites hebdomadaires → semaine, mois, année). La période du montant saisi reste toujours affichée.
  const start: VisitFrequency = frequency === 'visit' || PERIODS_PER_YEAR[visitFrequency] > PERIODS_PER_YEAR[frequency]
    ? visitFrequency : frequency;
  let periods: PriceFrequency[] = [...ROWS_FROM[start]];
  if (frequency !== 'visit' && !periods.includes(frequency)) periods.push(frequency);
  const visitIsPeriod = periods.some(p => perYear(p) === visitsPerYear);
  if (frequency === 'visit') periods = periods.filter(p => perYear(p) !== visitsPerYear);
  const keys: PriceFrequency[] = frequency === 'visit' || !visitIsPeriod ? ['visit', ...periods] : [...periods];
  keys.sort((a, b) => perYear(b) - perYear(a));
  const rows = keys.map(k => row(k, ROW_LABEL[k], exactHt[k], k === frequency));

  // Achat annuel = revenus annuels × % d'achat ; revenu net de la 1re année = revenus − achat, colonne par colonne
  const percent = Number.isFinite(input.purchasePercent) ? Math.max(0, input.purchasePercent) : 0;
  const revenue = { ...rows[rows.length - 1], key: 'revenue' as PriceRowKey, label: 'Revenus annuels', entered: false };
  const bought  = row('purchase', 'Achat annuel', yearHt * percent / 100);
  const minus   = (k: 'ht' | 'tps' | 'tvq' | 'ttc') => round2(revenue[k] - bought[k]);
  const net: PriceRow = { key: 'net', label: 'Revenu net de la 1re année', entered: false,
                          ht: minus('ht'), tps: minus('tps'), tvq: minus('tvq'), ttc: minus('ttc') };

  return { rows, purchase: [revenue, bought, net], visitsPerYear };
}
