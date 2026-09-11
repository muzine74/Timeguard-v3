import { HttpInterceptorFn } from '@angular/common/http';

const API_BASE = 'https://timeguardsapi.net:4001';

export const baseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/')) {
    return next(req.clone({ url: `${API_BASE}${req.url}` }));
  }
  return next(req);
};
