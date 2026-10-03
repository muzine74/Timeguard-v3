import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Suppression définitive (super utilisateur) — identifiants envoyés dans le corps, jamais dans l'URL. */
export type PurgeKind = 'bill' | 'employee' | 'company';

export interface PurgeCandidate { id: string; label: string; detail: string; }

export interface PurgeItem {
  label:   string;
  count:   number;
  samples: string[];
  action:  'delete' | 'detach' | 'file';
}

export interface PurgePreview {
  kind:         PurgeKind;
  id:           string;
  title:        string;
  items:        PurgeItem[];
  warnings:     string[];
  totalRecords: number;
  totalFiles:   number;
}

export interface PurgeResult {
  recordsDeleted:  number;
  recordsDetached: number;
  filesDeleted:    number;
  warnings:        string[];
}

@Injectable({ providedIn: 'root' })
export class PurgeService {
  constructor(private http: HttpClient) {}

  search(tenantId: string, kind: PurgeKind, query: string) {
    return this.http.post<PurgeCandidate[]>('/api/purge/search', { tenantId, kind, query });
  }

  preview(tenantId: string, kind: PurgeKind, id: string) {
    return this.http.post<PurgePreview>('/api/purge/preview', { tenantId, kind, id });
  }

  execute(tenantId: string, kind: PurgeKind, id: string, confirmation: string) {
    return this.http.post<PurgeResult>('/api/purge/execute', { tenantId, kind, id, confirmation });
  }
}
