/**
 * Date du jour au format yyyy-MM-dd, en heure LOCALE.
 * Ne pas utiliser `new Date().toISOString()` pour cela : il renvoie la date UTC, donc celle du
 * lendemain à partir de 20 h (heure de l'Est).
 */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
