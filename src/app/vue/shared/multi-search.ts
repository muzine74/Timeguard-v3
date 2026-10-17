import { ExportCell, ExportColumn, ExportDoc } from '../../state/export/table-export.service';
import { TableExportService } from '../../state/export/table-export.service';

/**
 * Recherche multicritères des champs « Rechercher » : « & » (ou « ; ») = ET, « | » = OU.
 * Le ET passe avant le OU : « a & b | c » = (a ET b) OU c. Chaque critère est cherché dans
 * l'ensemble des champs de la ligne, sans tenir compte des majuscules ni des accents.
 *   « dupont & montréal » → lignes contenant « dupont » ET « montréal » ;
 *   « dupont | tremblay » → lignes contenant « dupont » OU « tremblay ».
 *
 *   const query = searchTerms(this.search());
 *   rows.filter(r => matchesAll(query, r.name, r.city));
 */

export const MULTI_SEARCH_HINT = '« & » : les deux mots · « | » : l\'un ou l\'autre';

/** Requête analysée : alternatives (OU), chacune une liste de critères tous requis (ET). Vide = pas de recherche. */
export type SearchQuery = string[][];

/** Découpe brute (sans normaliser) : `|` puis `&` / `;`, vides ignorés. */
function parse(q: string | null | undefined, norm: (s: string) => string): SearchQuery {
  return (q ?? '').split('|')
    .map(alt => alt.split(/[&;]/).map(norm).filter(Boolean))
    .filter(alt => alt.length > 0);
}

export function normSearch(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Requête normalisée (voir SearchQuery). */
export function searchTerms(q: string | null | undefined): SearchQuery {
  return parse(q, normSearch);
}

/** Vrai si l'une des alternatives a tous ses critères vérifiés par `test` (requête vide = vrai). */
export function matchQuery(query: SearchQuery, test: (term: string) => boolean): boolean {
  return !query.length || query.some(alt => alt.every(test));
}

/**
 * Mot-clé d'état (« actif », « inactif », « payée »…) : trouvé seulement par son début, pour que
 * « actif » ne trouve pas « inactif » ni « payée » « impayée ».
 */
export interface SearchKeyword { kw: string }
export const kw = (s: string): SearchKeyword => ({ kw: s });

/** Vrai si la ligne (ses champs) répond à la requête : ET dans une alternative, OU entre alternatives. */
export function matchesAll(query: SearchQuery, ...fields: unknown[]): boolean {
  if (!query.length) return true;
  const texts: string[] = [], keywords: string[] = [];
  for (const f of fields.flat(2)) {
    if (f && typeof f === 'object' && 'kw' in f) keywords.push(normSearch((f as SearchKeyword).kw));
    else texts.push(normSearch(f));
  }
  const text = texts.join('\u0001');
  return matchQuery(query, t => text.includes(t) || keywords.some(k => k.startsWith(t)));
}

/** Raccourci : `multiMatch(this.search(), e.name, e.code)`. */
export function multiMatch(q: string | null | undefined, ...fields: unknown[]): boolean {
  return matchesAll(searchTerms(q), ...fields);
}

/** Libellé du filtre pour le sous-titre d'un export : « Recherche : a & b | c ». */
export function searchLabel(q: string | null | undefined): string {
  const query = parse(q, s => s.trim());
  return query.length ? `Recherche : ${query.map(alt => alt.join(' & ')).join(' | ')}` : '';
}

/** Document d'export d'une liste simple (une table) issue d'une recherche. */
export function listExportDoc(opts: {
  name: string; title: string; search?: string | null; extra?: string;
  columns: ExportColumn[]; rows: ExportCell[][]; landscape?: boolean;
}): ExportDoc {
  const subtitle = [opts.extra, searchLabel(opts.search), `${opts.rows.length} résultat(s)`].filter(Boolean).join(' · ');
  return {
    fileName: TableExportService.fileName(opts.name, new Date().toISOString().slice(0, 10)),
    title: opts.title,
    subtitle,
    landscape: opts.landscape,
    tables: [{ title: opts.title, columns: opts.columns, rows: opts.rows.map(cells => ({ cells })) }],
  };
}
