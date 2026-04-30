import { HttpInterceptorFn } from '@angular/common/http';

const API_BASE = 'http://timeguardsapi.net:4000';

export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/')) {
    return next(req.clone({ url: `${API_BASE}${req.url}` }));
  }
  return next(req);
};
