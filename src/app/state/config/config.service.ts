import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';

export interface AppConfigDto {
  logoPath:        string | null;
  companyName:     string | null;
  companyAddress:  string | null;
  companyCity:       string | null;
  companyProvince:   string | null;
  companyPostalCode: string | null;
  companyCountry:    string | null;
  companyPhone:    string | null;
  companyEmail:    string | null;
  smtpServer:      string | null;
  smtpPort:        number | null;
  smtpUser:        string | null;
  /** Jamais renvoyé par l'API. Laisser vide à l'enregistrement = mot de passe inchangé. */
  smtpPassword:    string | null;
  /** Un mot de passe SMTP est enregistré côté serveur. */
  hasSmtpPassword?: boolean;
  tpsNumber:       string | null;
  tvqNumber:       string | null;
  tpsRate:         number;
  tvqRate:         number;
  payerAccountNumber: string | null;
  bankCoordinates: string | null;
  contactName:     string | null;
  contactPhone:    string | null;
  contactEmail:    string | null;
  appVersion:      string | null;
  /** Délai d'inactivité (minutes) avant expiration de la session ; 0 = désactivé. */
  idleTimeoutMinutes?: number;
}

export interface AppConfigResponse {
  config: AppConfigDto;
}

export function emptyConfig(): AppConfigDto {
  return {
    logoPath: null, companyName: null, companyAddress: null,
    companyCity: null, companyProvince: null, companyPostalCode: null, companyCountry: null,
    companyPhone: null, companyEmail: null,
    smtpServer: null, smtpPort: null, smtpUser: null, smtpPassword: null,
    tpsNumber: null, tvqNumber: null, tpsRate: 5, tvqRate: 9.975,
    payerAccountNumber: null,
    bankCoordinates: null,
    contactName: null, contactPhone: null, contactEmail: null,
    appVersion: null,
    idleTimeoutMinutes: 0,
  };
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  /** Version affichée dans la navbar = Configuration → Application → Version (null = non renseignée). */
  private _appVersion = signal<string | null>(null);
  readonly appVersion = this._appVersion.asReadonly();
  /** Nom de l'entreprise (Configuration → Entreprise) affiché à gauche de la barre, à la place de « TimeGuard ». */
  private _companyName = signal<string | null>(null);
  readonly companyName = this._companyName.asReadonly();
  /** Délai d'inactivité (minutes) de l'entreprise avant expiration de la session ; 0 = désactivé. */
  private _idleTimeout = signal(0);
  readonly idleTimeoutMinutes = this._idleTimeout.asReadonly();

  constructor(private http: HttpClient) {}

  get() {
    return this.http.get<AppConfigResponse>('/api/config');
  }

  /** Lecture de la seule version (tout utilisateur connecté — /api/config est réservé à config.manage). */
  loadVersion(): void {
    this.http.get<{ appVersion: string | null; companyName?: string | null; idleTimeoutMinutes?: number }>('/api/config/version').subscribe({
      next:  r => {
        this._appVersion.set(ConfigService.normalizeVersion(r?.appVersion));
        this._companyName.set(r?.companyName?.trim() || null);
        this._idleTimeout.set(Math.max(0, r?.idleTimeoutMinutes ?? 0));
      },
      error: () => { this._appVersion.set(null); this._companyName.set(null); },
    });
  }

  clearVersion(): void { this._appVersion.set(null); this._companyName.set(null); this._idleTimeout.set(0); }

  save(config: AppConfigDto) {
    return this.http.put<{ message: string }>('/api/config', { config }).pipe(
      tap(() => {
        this._appVersion.set(ConfigService.normalizeVersion(config.appVersion));
        this._companyName.set(config.companyName?.trim() || null);
        this._idleTimeout.set(Math.max(0, config.idleTimeoutMinutes ?? 0));
      }),
    );
  }

  /** « 2.1 », « v2.1 » ou « V 2.1 » → « 2.1 » (la navbar ajoute le préfixe « v »). */
  static normalizeVersion(v: string | null | undefined): string | null {
    const t = (v ?? '').trim().replace(/^v\s*/i, '');
    return t || null;
  }
}
