import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { CompanyForm } from  '../../models';

export interface CompanyCreateResponse {
  companyId: string;
  message:   string;
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private _saving  = signal(false);
  private _error   = signal<string | null>(null);
  private _lastId  = signal<string | null>(null);

  readonly saving  = this._saving.asReadonly();
  readonly error   = this._error.asReadonly();
  readonly lastId  = this._lastId.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[CompanyService]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[CompanyService]', ...a); }

  constructor(private http: HttpClient) {}

  // ── Créer une compagnie ───────────────────────────────
  create(form: CompanyForm) {
    this.log('create() → POST /api/companies', form);
    this._saving.set(true);
    this._error.set(null);

    return this.http.post<CompanyCreateResponse>('/api/companies', form).pipe(
      tap({
        next: res => {
          this.log('✓ compagnie créée:', res);
          this._lastId.set(res?.companyId ?? null);
          this._saving.set(false);
        },
        error: err => {
          this.warn('✕ POST /api/companies échoué');
          this.warn(`  status:  ${err.status}`);
          this.warn(`  message: ${err.message}`);
          this.warn(`  body:   `, err.error);
          this._error.set(`HTTP ${err.status} — ${err.message}`);
          this._saving.set(false);
        }
      })
    );
  }

  reset(): void {
    this._error.set(null);
    this._lastId.set(null);
  }
}