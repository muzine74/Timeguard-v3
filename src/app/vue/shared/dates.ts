import { currentLang, locale } from '../../state/i18n/i18n.service';

/** « 3 oct. 2026 à 12 h 40 » en français ; date et heure courtes dans la langue affichée sinon. */
export function dateTimeLabel(d: Date): string {
  if (currentLang() !== 'fr')
    return d.toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const date = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
  return `${date} à ${time}`;
}

/**
 * Date du jour au format yyyy-MM-dd, en heure LOCALE.
 * Ne pas utiliser `new Date().toISOString()` pour cela : il renvoie la date UTC, donc celle du
 * lendemain à partir de 20 h (heure de l'Est).
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
