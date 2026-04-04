import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Vérifie que l'utilisateur est connecté. */
export const authGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  return auth.loggedIn() ? true : router.createUrlTree(['/login']);
};

/** Réservé aux admins — redirige les users vers /pointage. */
export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  return auth.isAdmin() ? true : router.createUrlTree(['/pointage']);
};

/** Réservé aux users — redirige les admins vers /employees. */
export const userGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  return auth.isUser() ? true : router.createUrlTree(['/employees']);
};

/** Route racine — redirige selon le rôle. */
export const homeGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  if (!auth.loggedIn()) return router.createUrlTree(['/login']);
  return auth.isAdmin()
    ? router.createUrlTree(['/employees'])
    : router.createUrlTree(['/pointage']);
};
