import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const token  = auth.token();
  const slug   = auth.tenantSlug();

  let headers = req.headers;
  if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  if (slug)  headers = headers.set('X-Tenant-Slug', slug);

  const r = headers !== req.headers ? req.clone({ headers }) : req;

  return next(r).pipe(
    catchError((e: HttpErrorResponse) => {
      if (e.status === 401) {
        auth.logout();
        // Session expirée : revenir sur la page en cours après reconnexion
        const here = router.url;
        router.navigate(['/login'], here && !here.startsWith('/login') ? { queryParams: { returnUrl: here, expired: 1 } } : {});
      }
      return throwError(() => e);
    })
  );
};
