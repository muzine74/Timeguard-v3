import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { PERM } from './permissions';

/** Vers la connexion, en mémorisant la page demandée (retour après connexion). */
const _toLogin = (router: Router, state?: RouterStateSnapshot): UrlTree =>
  router.createUrlTree(['/login'], state?.url && state.url !== '/' ? { queryParams: { returnUrl: state.url } } : {});

const _check = (auth: AuthService, router: Router, state?: RouterStateSnapshot): UrlTree | null => {
  if (!auth.loggedIn()) return _toLogin(router, state);
  // Super user : toujours autorisé
  if (auth.isSuperUser()) return null;
  if (!auth.loggedInWithAccess()) { auth.logout(); return router.createUrlTree(['/login']); }
  return null;
};

/**
 * Factory — retourne un guard qui vérifie une permission spécifique.
 * Super user : bypass automatique sur toutes les routes.
 */
export const permGuard = (key: string): CanActivateFn => (_route, state) => {
  const auth = inject(AuthService); const router = inject(Router);
  const fail = _check(auth, router, state);
  if (fail) return fail;
  // Super user a accès à tout
  if (auth.isSuperUser()) return true;
  return auth.hasPerm(key) && auth.canOpen(state.url) ? true : router.createUrlTree(['/']);
};

/** Comme permGuard, mais une seule des permissions données suffit. */
export const anyPermGuard = (...keys: string[]): CanActivateFn => (_route, state) => {
  const auth = inject(AuthService); const router = inject(Router);
  const fail = _check(auth, router, state);
  if (fail) return fail;
  if (auth.isSuperUser()) return true;
  return keys.some(k => auth.hasPerm(k)) && auth.canOpen(state.url) ? true : router.createUrlTree(['/']);
};

/** Guard générique — accessible à tout utilisateur connecté, sans permission spécifique. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService); const router = inject(Router);
  const fail = _check(auth, router, state);
  if (fail) return fail;
  return auth.canOpen(state.url) ? true : router.createUrlTree(['/']);
};

/** Guard réservé au super utilisateur. */
export const superUserGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.loggedIn())    return router.createUrlTree(['/login']);
  if (auth.isSuperUser())  return true;
  return router.createUrlTree(['/']);
};

/** Permissions qui donnent une section ou un intérêt au tableau de bord. */
export const DASHBOARD_PERMS: string[] = [
  PERM.pointageValidate, PERM.invoicesView, PERM.invoicesEdit, PERM.invoicesSend,
  PERM.paymentsManage, PERM.statsView, PERM.companiesEdit, PERM.employeesEdit, PERM.configManage,
];

/** Route racine — redirige selon les permissions. */
export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  // Super user sans entreprise cible → panneau providers
  if (auth.isSuperUser()) return router.createUrlTree(['/providers']);
  // Rôles de gestion : page d'accueil (tableau de bord). Un simple employé arrive directement sur sa page.
  if (DASHBOARD_PERMS.some(p => auth.hasPerm(p))) return router.createUrlTree(['/accueil']);
  // Première page que l'utilisateur peut réellement ouvrir (droit d'action ET droit de page) : une page refusée
  // renvoie ici, il ne faut donc jamais y renvoyer.
  const first = ([
    [PERM.employeesView, '/employees'], [PERM.pointageView, '/pointage'], [PERM.invoicesView, '/invoices'],
    [PERM.companiesEdit, '/companies/assign'], [PERM.groupsManage, '/groups'], [PERM.configManage, '/config'],
  ] as const).find(([perm, url]) => auth.hasPerm(perm) && auth.canOpen(url));
  if (first) return router.createUrlTree([first[1]]);
  // Aucune de ces pages : Notes est ouverte à tout utilisateur connecté qui en a la page, sinon l'Aide (sans droit de page)
  if (auth.loggedInWithAccess()) return router.createUrlTree([auth.canOpen('/notes') ? '/notes' : '/aide']);
  auth.logout();
  return router.createUrlTree(['/login']);
};
