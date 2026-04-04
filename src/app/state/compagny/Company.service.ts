import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs';
import { CompanyForm } from '../../models';

export interface CompanySummary {
  companyId:   string;
  companyName: string;
  isActive:    boolean;
}

export interface CompanyCreateResponse {
  companyId: string;
  message:   string;
}

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private _saving = signal(false);
  private _error  = signal<string | null>(null);
  private _lastId = signal<string | null>(null);

  readonly saving = this._saving.asReadonly();
  readonly error  = this._error.asReadonly();
  readonly lastId = this._lastId.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[CompanyService]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[CompanyService]', ...a); }

  constructor(private http: HttpClient) {}

  // ── GET /api/companies ─────────────────────────────────
  getAll() {
    this.log('getAll() → GET /api/companies');
    return this.http.get<CompanySummary[]>('/api/companies').pipe(
      tap({
        next:  list => this.log(`✓ ${list.length} compagnie(s)`),
        error: err  => this.warn(`✕ GET /api/companies échoué (${err.status})`),
      })
    );
  }

  // ── GET /api/companies/{id} ─────────────────────────────
  getById(id: string) {
    this.log(`getById(${id}) → GET /api/companies/${id}`);
    return this.http.get<any>(`/api/companies/${id}`).pipe(
      tap({ error: err => this.warn(`✕ GET /api/companies/${id} échoué (${err.status})`, err.error) }),
      map((d: any): CompanyForm => ({
        companyName:       d.name        ?? d.companyName        ?? '',
        companyCode:       d.code        ?? d.companyCode        ?? '',
        isActive:          d.isActive    ?? false,
        providerId:        d.providerId  ?? '',
        note:              d.note        ?? '',
        civicNumber:       d.address?.civicNumber  ?? d.civicNumber  ?? '',
        suite:             d.address?.suite        ?? d.suite        ?? '',
        city:              d.address?.city         ?? d.city         ?? '',
        state:             d.address?.state        ?? d.state        ?? '',
        country:           d.address?.country      ?? d.country      ?? '',
        zipCode:           d.address?.zipCode      ?? d.zipCode      ?? '',
        addressNote:       d.address?.note         ?? d.addressNote  ?? '',
        contactName:       d.contact?.name         ?? d.contactName  ?? '',
        contactMail:       d.contact?.mail         ?? d.contactMail  ?? '',
        contactPhone:      d.contact?.phone        ?? d.contactPhone ?? '',
        contactNote:       d.contact?.note         ?? d.contactNote  ?? '',
        tps:               d.taxes?.tps            ?? d.tps          ?? '',
        tvq:               d.taxes?.tvq            ?? d.tvq          ?? '',
        frequencePaiement: this._mapFreq(d.planning?.frequencePaiement ?? d.frequencePaiement),
        frequenceTravail:  this._mapFreq(d.planning?.frequenceTravail  ?? d.frequenceTravail),
        semaine1:          d.planning?.semaine1    ?? d.semaine1    ?? this._emptySemaine(),
        semaine2:          d.planning?.semaine2    ?? d.semaine2    ?? this._emptySemaine(),
        joursBiMensuel:    d.planning?.joursBiMensuel ?? d.joursBiMensuel ?? [],
        joursMensuel:      d.planning?.joursMensuel   ?? d.joursMensuel   ?? [],
      }))
    );
  }

  /** Convertit les chaînes vides en null pour les champs validés côté API ([EmailAddress], [Phone]). */
  private _sanitize(form: CompanyForm): any {
    return {
      ...form,
      contactMail:  form.contactMail  || null,
      contactPhone: form.contactPhone || null,
    };
  }

  private _mapFreq(val: any): CompanyForm['frequencePaiement'] {
    const map: Record<number, string> = { 0: 'hebdomadaire', 1: 'biHebdomadaire', 2: 'biMensuel', 3: 'mensuel' };
    if (typeof val === 'number') return (map[val] ?? 'hebdomadaire') as any;
    return val ?? 'hebdomadaire';
  }

  private _emptySemaine() {
    const j = () => ({ actif: false, compagnie: 0, employe: 0 });
    return { lundi:j(), mardi:j(), mercredi:j(), jeudi:j(), vendredi:j(), samedi:j(), dimanche:j() };
  }

  // ── POST /api/companies ─────────────────────────────────
  create(form: CompanyForm) {
    this.log('create() → POST /api/companies', form);
    this._saving.set(true);
    this._error.set(null);

    return this.http.post<CompanyCreateResponse>('/api/companies', this._sanitize(form)).pipe(
      tap({
        next: res => {
          this.log('✓ créée:', res);
          this._lastId.set(res?.companyId ?? null);
          this._saving.set(false);
        },
        error: err => {
          this.warn(`✕ POST échoué (${err.status})`, err.error);
          this._error.set(`HTTP ${err.status} — ${err.message}`);
          this._saving.set(false);
        }
      })
    );
  }

  // ── PUT /api/companies/{id} ─────────────────────────────
  update(id: string, form: CompanyForm) {
    this.log(`update(${id}) → PUT /api/companies/${id}`, form);
    this._saving.set(true);
    this._error.set(null);

    return this.http.put<CompanyCreateResponse>(`/api/companies/${id}`, this._sanitize(form)).pipe(
      tap({
        next: res => {
          this.log('✓ mise à jour:', res);
          this._saving.set(false);
        },
        error: err => {
          this.warn(`✕ PUT /api/companies/${id} échoué (${err.status})`, err.error);
          this._error.set(`HTTP ${err.status} — ${err.message}`);
          this._saving.set(false);
        }
      })
    );
  }

  reset(): void { this._error.set(null); this._lastId.set(null); }
}