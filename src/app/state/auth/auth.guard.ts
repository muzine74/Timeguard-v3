import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { PERM } from './permissions';

const _check = (auth: AuthService, router: Router): UrlTree | null => {
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  // Super user : toujours autorisé
  if (auth.isSuperUser()) return null;
  if (!auth.loggedInWithAccess()) { auth.logout(); return router.createUrlTree(['/login']); }
  return null;
};

/**
 * Factory — retourne un guard qui vérifie une permission spécifique.
 * Super user : bypass automatique sur toutes les routes.
 */
export const permGuard = (key: string): CanActivateFn => () => {
  const auth = inject(AuthService); const router = inject(Router);
  const fail = _check(auth, router);
  if (fail) return fail;
  // Super user a accès à tout
  if (auth.isSuperUser()) return true;
  return auth.hasPerm(key) ? true : router.createUrlTree(['/']);
};

/** Guard réservé au super utilisateur. */
export const superUserGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.loggedIn())    return router.createUrlTree(['/login']);
  if (auth.isSuperUser())  return true;
  return router.createUrlTree(['/']);
};

/** Route racine — redirige selon les permissions. */
export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  // Super user sans entreprise cible → panneau providers
  if (auth.isSuperUser()) return router.createUrlTree(['/providers']);
  if (auth.hasPerm(PERM.employeesView))   return router.createUrlTree(['/employees']);
  if (auth.hasPerm(PERM.pointageView))    return router.createUrlTree(['/pointage']);
  if (auth.hasPerm(PERM.invoicesView))    return router.createUrlTree(['/invoices']);
  if (auth.hasPerm(PERM.companiesEdit))   return router.createUrlTree(['/companies/assign']);
  if (auth.hasPerm(PERM.groupsManage))    return router.createUrlTree(['/groups']);
  if (auth.hasPerm(PERM.configManage))    return router.createUrlTree(['/config']);
  auth.logout();
  return router.createUrlTree(['/login']);
};
