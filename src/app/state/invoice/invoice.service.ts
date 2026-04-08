import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs';

// ── Modèles ───────────────────────────────────────────────────────────────────
export interface BillLine {
  id:          string;
  quantity:    number;
  description: string;
  unitPrice:   number;
  subTotal:    number;
}

export interface BillSummary {
  billIdentifier: number;
  billId:         string;
  billNumber:     string;
  companyName:    string;
  companyCode:    string;
  period:         string;
  billedDate:     string;
  totalBeforeTax: number;
  tps:            number;
  tvq:            number;
  totalWithTax:   number;
  isSent:         boolean;
  isPaid:         boolean;
  note:           string;
  filePath:       string;
}

export interface BillDetail extends BillSummary {
  numberOfVisits: number;
  companyPrice:   number;
  paymentInfo:    string;
  lines:          BillLine[];
}

export interface BillCreatePayload {
  companyName:    string;
  companyCode:    string;
  period:         string;
  billedDate:     string;
  companyPrice:   number;
  numberOfVisits: number;
  totalBeforeTax: number;
  tps:            number;
  tvq:            number;
  totalWithTax:   number;
  note:           string;
  paymentInfo:    string;
  lines:          BillLine[];
}

export interface BillFilter {
  search?:      string;
  onlySent?:    boolean;
  onlyNotSent?: boolean;
  onlyPaid?:    boolean;
  onlyUnpaid?:  boolean;
  dateFrom?:    string;
  dateTo?:      string;
}

export interface BillableCompanyItem {
  companyId:    string;
  companyName:  string;
  companyCode:  string;
  totalVisits:  number;
  totalAmount:  number;
  /** Semaines (lundi yyyy-MM-dd) dont le pointage n'est pas encore validé. */
  pendingWeeks: string[];
}

export interface BillableCompanies {
  eligible: BillableCompanyItem[];
  pending:  BillableCompanyItem[];
}

// ── Service ───────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private _saving  = signal(false);
  private _loading = signal(false);
  private _error   = signal<string | null>(null);
  // Perf #13 : cache signal — conserve la dernière liste entre les navigations
  private _list    = signal<BillSummary[]>([]);

  readonly saving  = this._saving.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error   = this._error.asReadonly();
  readonly list    = this._list.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[InvoiceService]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[InvoiceService]', ...a); }

  constructor(private http: HttpClient) {}

  // ── Liste filtrée ─────────────────────────────────────────────────────────
  getAll(filter: BillFilter = {}) {
    this.log('getAll()', filter);
    let params = new HttpParams();
    if (filter.search)      params = params.set('search',      filter.search);
    if (filter.onlySent)    params = params.set('onlySent',    'true');
    if (filter.onlyNotSent) params = params.set('onlyNotSent', 'true');
    if (filter.onlyPaid)    params = params.set('onlyPaid',    'true');
    if (filter.onlyUnpaid)  params = params.set('onlyUnpaid',  'true');
    if (filter.dateFrom)    params = params.set('dateFrom',    filter.dateFrom);
    if (filter.dateTo)      params = params.set('dateTo',      filter.dateTo);

    this._loading.set(true);
    return this.http.get<BillSummary[]>('/api/bills', { params }).pipe(
      tap({
        next: list => {
          this._list.set(list);
          this.log(`✓ ${list.length} facture(s)`);
          this._loading.set(false);
        },
        error: err => {
          this.warn('✕ GET /api/bills', err);
          this._error.set(`HTTP ${err.status}`);
          this._loading.set(false);
        },
      }),
    );
  }

  // ── Détail ────────────────────────────────────────────────────────────────
  getById(id: number) {
    this.log(`getById(${id})`);
    return this.http.get<BillDetail>(`/api/bills/${id}`).pipe(
      tap({
        next:  b   => this.log('✓ détail:', b),
        error: err => this.warn(`✕ GET /api/bills/${id}`, err),
      }),
    );
  }

  // ── Créer ─────────────────────────────────────────────────────────────────
  create(payload: BillCreatePayload) {
    this.log('create()', payload);
    this._saving.set(true); this._error.set(null);
    return this.http.post<{ billIdentifier: number; billNumber: string; message: string }>('/api/bills', payload).pipe(
      tap({
        next:  res => { this.log('✓ créée:', res); this._saving.set(false); },
        error: err => { this.warn('✕ POST /api/bills', err); this._error.set(err?.error?.message ?? `HTTP ${err.status}`); this._saving.set(false); },
      }),
    );
  }

  // ── Modifier ──────────────────────────────────────────────────────────────
  update(id: number, payload: BillCreatePayload) {
    this.log(`update(${id})`);
    this._saving.set(true); this._error.set(null);
    return this.http.put<{ message: string }>(`/api/bills/${id}`, payload).pipe(
      tap({
        next:  res => { this.log('✓ mise à jour:', res); this._saving.set(false); },
        error: err => { this.warn(`✕ PUT /api/bills/${id}`, err); this._error.set(err?.error?.message ?? `HTTP ${err.status}`); this._saving.set(false); },
      }),
    );
  }

  // ── Envoyer ───────────────────────────────────────────────────────────────
  markSent(id: number) {
    this.log(`markSent(${id})`);
    return this.http.post<{ message: string }>(`/api/bills/${id}/send`, {}).pipe(
      tap({
        next:  res => this.log('✓ envoyée:', res),
        error: err => this.warn(`✕ POST /api/bills/${id}/send`, err),
      }),
    );
  }

  // ── Payée ─────────────────────────────────────────────────────────────────
  markPaid(id: number, isPaid: boolean) {
    this.log(`markPaid(${id}, ${isPaid})`);
    return this.http.post<{ message: string }>(`/api/bills/${id}/paid`, { isPaid }).pipe(
      tap({
        next:  res => this.log('✓ statut paiement:', res),
        error: err => this.warn(`✕ POST /api/bills/${id}/paid`, err),
      }),
    );
  }

  // ── Supprimer ─────────────────────────────────────────────────────────────
  delete(id: number) {
    this.log(`delete(${id})`);
    return this.http.delete<{ message: string }>(`/api/bills/${id}`).pipe(
      tap({
        next:  res => { this.log('✓ supprimée:', res); this._list.update(l => l.filter(b => b.billIdentifier !== id)); },
        error: err => this.warn(`✕ DELETE /api/bills/${id}`, err),
      }),
    );
  }

  // ── Avoir ─────────────────────────────────────────────────────────────────
  createAvoir(id: number, payload: BillCreatePayload) {
    this.log(`createAvoir(${id})`);
    this._saving.set(true); this._error.set(null);
    return this.http.post<{ billIdentifier: number; billNumber: string; message: string }>(`/api/bills/${id}/avoir`, payload).pipe(
      tap({
        next:  res => { this.log('✓ avoir créé:', res); this._saving.set(false); },
        error: err => { this.warn(`✕ POST /api/bills/${id}/avoir`, err); this._error.set(err?.error?.message ?? `HTTP ${err.status}`); this._saving.set(false); },
      }),
    );
  }

  // ── Fichier joint ─────────────────────────────────────────────────────
  uploadFile(id: number, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ fileName: string; message: string }>(`/api/bills/${id}/upload`, form);
  }

  downloadFile(id: number) {
    return this.http.get(`/api/bills/${id}/file`, { responseType: 'blob' as const });
  }

  // ── Compagnies facturables ─────────────────────────────────────────────
  getEligible(period: string) {
    this.log(`getEligible(${period})`);
    return this.http.get<BillableCompanies>('/api/bills/eligible', { params: { period } });
  }

  reset() { this._error.set(null); }
}
