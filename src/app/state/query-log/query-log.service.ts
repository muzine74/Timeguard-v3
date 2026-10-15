import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** Nature d'une requête ; « WRITE » = toutes les modifications (INSERT, UPDATE, DELETE, MERGE). */
export type QueryKind = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'MERGE' | 'EXEC' | 'AUTRE';

export interface QueryLogItem {
  id:          number;
  /** UTC (ISO 8601). */
  executedAt:  string;
  account:     string;
  tenantId:    string | null;
  tenantName:  string | null;
  isSuperUser: boolean;
  kind:        QueryKind;
  durationMs:  number;
  failed:      boolean;
  /** Requête HTTP d'origine, ex. « PUT /api/charges/42 » (notée, mais plus affichée). */
  request:     string | null;
  /** Texte SQL tel qu'envoyé, avec ses paramètres (@p0, @p1…). */
  sql:         string;
  /** Valeurs des paramètres en JSON (« {"@p0":"Loyer"} »), sensibles masquées (« *** ») ; null si aucune ou non notées. */
  parameters:  string | null;
}

export interface QueryLogPage {
  total:    number;
  page:     number;
  pageSize: number;
  items:    QueryLogItem[];
  /** Comptes présents sur la période. */
  accounts: string[];
  from:     string;
  to:       string;
  /** Faux tant que la colonne des valeurs n'existe pas dans la base (script AddQueryLogParameters). */
  hasParameters: boolean;
}

export interface QueryLogFilter {
  /** Bornes en UTC (ISO 8601). */
  from?:       string;
  to?:         string;
  account?:    string;
  tenantId?:   string;
  kind?:       QueryKind | 'WRITE' | '';
  failedOnly?: boolean;
  search?:     string;
  page?:       number;
  pageSize?:   number;
}

/** Journal des requêtes envoyées à la base, avec le compte qui les a déclenchées (super-administrateur). */
@Injectable({ providedIn: 'root' })
export class QueryLogService {
  constructor(private http: HttpClient) {}

  search(f: QueryLogFilter) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(f)) {
      if (value === undefined || value === null || value === '' || value === false) continue;
      params = params.set(key, String(value));
    }
    return this.http.get<QueryLogPage>('/api/query-logs', { params });
  }
}
