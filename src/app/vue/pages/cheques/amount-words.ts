/** Montant d'un chèque en toutes lettres, en français : « Mille deux cent trente-quatre dollars et 56/100 ». */

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
               'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

/** 0 à 99. `final` : le nombre termine le groupe (accord de « quatre-vingts »). */
function below100(n: number, final: boolean): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const t = Math.floor(n / 10), u = n % 10;
    return u === 0 ? TENS[t] : u === 1 ? `${TENS[t]} et un` : `${TENS[t]}-${UNITS[u]}`;
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${UNITS[n - 60]}`;
  if (n === 80) return final ? 'quatre-vingts' : 'quatre-vingt';
  return `quatre-vingt-${UNITS[n - 80]}`;
}

/** 0 à 999. `final` : rien ne suit dans le nombre, ou un nom (million) — « cents » et « vingts » prennent alors leur s. */
function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h === 1) parts.push('cent');
  else if (h > 1) parts.push(`${UNITS[h]} ${r === 0 && final ? 'cents' : 'cent'}`);
  if (r > 0 || h === 0) parts.push(below100(r, final));
  return parts.join(' ');
}

/** Entier de 0 à 999 999 999 en toutes lettres. */
export function integerInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return UNITS[0];
  const millions = Math.floor(n / 1_000_000), thousands = Math.floor(n / 1000) % 1000, rest = n % 1000;
  const parts: string[] = [];
  if (millions > 0) parts.push(`${below1000(millions, true)} million${millions > 1 ? 's' : ''}`);
  // « mille » est invariable et ne prend pas « un » ; devant lui, « cent » et « vingt » ne s'accordent pas
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${below1000(thousands, false)} mille`);
  if (rest > 0) parts.push(below1000(rest, true));
  return parts.join(' ');
}

/**
 * Montant d'un chèque : dollars en lettres, cents en chiffres sur 100.
 * Renvoie une chaîne vide si le montant n'est pas valide (négatif, nul, ou un milliard et plus).
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '';
  const cents = Math.round(amount * 100);
  const dollars = Math.floor(cents / 100), rest = cents % 100;
  if (dollars >= 1_000_000_000) return '';
  const words = integerInWords(dollars);
  // « un million de dollars », « deux millions de dollars » : « de » après million quand rien ne suit
  const link = dollars >= 1_000_000 && dollars % 1_000_000 === 0 ? ' de' : '';
  const text = `${words}${link} dollar${dollars > 1 ? 's' : ''} et ${String(rest).padStart(2, '0')}/100`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
