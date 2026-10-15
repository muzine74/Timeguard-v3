/**
 * Droits de page : chaque page du menu a son propre droit (« page.… » dans le catalogue des permissions).
 * Il s'AJOUTE au droit d'action de la page (ex. Charges = `page.charges` + `invoices.view`).
 *
 * Les droits de page ne s'appliquent que si l'utilisateur porte le marqueur `pages.enabled`, ajouté par l'API
 * quand le catalogue contient des droits de page (script 20261102000000_AddPagePermissions). Avant ce script,
 * les pages s'ouvrent comme avant.
 *
 * Accueil, Aide et l'écran du super-administrateur n'ont pas de droit de page.
 */
export const PAGES_ENABLED = 'pages.enabled';

/** Adresse → droit de page. La première expression qui correspond l'emporte : les plus précises d'abord. */
const PAGE_RULES: [RegExp, string][] = [
  [/^\/pointage(\/|$)/,                  'page.pointage'],
  [/^\/team(\/|$)/,                      'page.team'],
  [/^\/notes(\/|$)/,                     'page.notes'],
  [/^\/calendrier(\/|$)/,                'page.calendar'],
  [/^\/employees\/new(\/|$)/,            'page.employees.new'],
  [/^\/employees\/edit(\/|$)/,           'page.employees.edit'],
  [/^\/employees\/[^/]+\/edit(\/|$)/,    'page.employees.edit'],
  [/^\/employees\/pricing(\/|$)/,        'page.employees.pricing'],
  [/^\/employees\/assign(\/|$)/,         'page.employees.assign'],
  [/^\/employees\/t4a(\/|$)/,            'page.t4a'],
  [/^\/employees\/payments(\/|$)/,       'page.payments'],
  [/^\/employees\/credentials(\/|$)/,    'page.credentials'],
  [/^\/employees(\/|$)/,                 'page.employees.timesheets'],   // liste et fiche d'un employé
  [/^\/companies\/new(\/|$)/,            'page.companies.new'],
  [/^\/companies\/assign(\/|$)/,         'page.companies.assign'],
  [/^\/companies(\/|$)/,                 'page.companies.list'],         // liste et fiche d'une compagnie
  [/^\/communications(\/|$)/,            'page.communications'],
  [/^\/invoices\/new(\/|$)/,             'page.invoices.new'],
  [/^\/invoices\/from-timesheets(\/|$)/, 'page.invoices.timesheets'],
  [/^\/invoices\/send(\/|$)/,            'page.invoices.send'],
  [/^\/invoices\/download(\/|$)/,        'page.invoices.download'],
  [/^\/invoices\/report(\/|$)/,          'page.reports'],
  [/^\/invoices(\/|$)/,                  'page.invoices'],
  [/^\/prix(\/|$)/,                      'page.prix'],
  [/^\/charges(\/|$)/,                   'page.charges'],
  [/^\/cheques(\/|$)/,                   'page.cheques'],
  [/^\/bank-statement(\/|$)/,            'page.bank'],
  [/^\/stats(\/|$)/,                     'page.stats'],                  // et ses pages de détail
  [/^\/groups(\/|$)/,                    'page.groups'],
  [/^\/config(\/|$)/,                    'page.config'],
  [/^\/purge(\/|$)/,                     'page.purge'],
  [/^\/journal(\/|$)/,                   'page.journal'],
];

/** Droit de page d'une adresse (« /charges », « /employees/…/edit?x=1 »), ou null si la page n'en a pas. */
export function pageKeyFor(url: string): string | null {
  const path = (url || '/').split(/[?#]/)[0];
  return PAGE_RULES.find(([rx]) => rx.test(path))?.[1] ?? null;
}
