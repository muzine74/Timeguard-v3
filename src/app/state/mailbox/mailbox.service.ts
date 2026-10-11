import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Boîte de courriel lue par TimeGuard (Administration → Configuration → Courriels reçus). */
export interface MailboxConfig {
  enabled:         boolean;
  directoryId:     string | null;
  clientId:        string | null;
  clientSecret:    string | null;     // écriture seule : jamais renvoyé par l'API
  hasClientSecret: boolean;
  mailbox:         string | null;
  importPastDays:  number;            // écriture seule : reprendre aussi les N derniers jours
  lastCheckedAt:   string | null;     // lecture seule, ISO UTC
  lastError:       string | null;     // lecture seule
}

export interface MailImportResult {
  examined: number;                   // courriels reçus examinés
  added:    number;                   // entrées ajoutées à l'historique
  error:    string;                   // vide = lecture réussie
}

/** Courriels reçus des contacts des compagnies, ajoutés à l'historique de communication. */
@Injectable({ providedIn: 'root' })
export class MailboxService {
  constructor(private http: HttpClient) {}

  getConfig()                    { return this.http.get<MailboxConfig>('/api/mailbox/config'); }
  saveConfig(cfg: MailboxConfig) { return this.http.put<MailboxConfig>('/api/mailbox/config', cfg); }
  /** Lit la boîte tout de suite, sans attendre la lecture automatique (toutes les cinq minutes). */
  check()                        { return this.http.post<MailImportResult>('/api/mailbox/check', {}); }
}
