import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';
import { PERM } from './permissions';

const _check = (auth: AuthService, router: Router): UrlTree | null => {
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  if (!auth.loggedInWithAccess()) { auth.logout(); return router.createUrlTree(['/login']); }
  return null;
};

/**
 * Factory — retourne un guard qui vérifie une permission spécifique.
 * En cas d'échec → redirige vers / (homeGuard prend ensuite le relais).
 */
export const permGuard = (key: string): CanActivateFn => () => {
  const auth = inject(AuthService); const router = inject(Router);
  const fail = _check(auth, router);
  if (fail) return fail;
  return auth.hasPerm(key) ? true : router.createUrlTree(['/']);
};

/** Route racine — redirige selon les permissions. */
export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService); const router = inject(Router);
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  if (auth.hasPerm(PERM.employeesView))   return router.createUrlTree(['/employees']);
  if (auth.hasPerm(PERM.pointageView))    return router.createUrlTree(['/pointage']);
  if (auth.hasPerm(PERM.invoicesView))    return router.createUrlTree(['/invoices']);
  if (auth.hasPerm(PERM.companiesEdit))   return router.createUrlTree(['/companies/assign']);
  if (auth.hasPerm(PERM.groupsManage))    return router.createUrlTree(['/groups']);
  if (auth.hasPerm(PERM.configManage))    return router.createUrlTree(['/config']);
  auth.logout();
  return router.createUrlTree(['/login']);
};
