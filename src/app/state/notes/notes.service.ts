import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** Entité à laquelle une note peut être rattachée. */
export type NoteLinkType = 'employee' | 'company' | 'bill';

export const NOTE_LINK_LABELS: Record<NoteLinkType, string> = {
  employee: 'Employé',
  company:  'Compagnie',
  bill:     'Facture',
};

export interface NoteItem {
  noteId:                string;
  title:                 string;
  description:           string;
  isActive:              boolean;
  createdAt:             string;
  createdByEmployeeId:   string;
  createdByEmployeeName: string;
  /** Entités liées (vide = note générale). */
  links:                 NoteLink[];
}

/** Lien d'une note vers un employé, une compagnie ou une facture. */
export interface NoteLink {
  entityType:  NoteLinkType;
  entityId:    string;
  /** Renseigné par l'API (nom employé/compagnie, numéro de facture). */
  entityName?: string | null;
}

export interface NoteCreatePayload {
  title:       string;
  description: string;
  isActive:    boolean;
  links:       Pick<NoteLink, 'entityType' | 'entityId'>[];
}

/** Entités concernées par une action (pointage, modification, facture…). */
export interface NoteAlertRefs {
  employeeIds?: (string | null | undefined)[];
  companyIds?:  (string | null | undefined)[];
  billIds?:     (string | null | undefined)[];
}

@Injectable({ providedIn: 'root' })
export class NotesService {
  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<NoteItem[]>('/api/notes');
  }

  /** Notes actives liées à l'une des entités (déjà dédoublonnées côté API). */
  getAlerts(refs: NoteAlertRefs) {
    let params = new HttpParams();
    const add = (key: string, ids?: (string | null | undefined)[]) =>
      (ids ?? []).forEach(id => { if (id) params = params.append(key, id); });
    add('employeeIds', refs.employeeIds);
    add('companyIds',  refs.companyIds);
    add('billIds',     refs.billIds);
    return this.http.get<NoteItem[]>('/api/notes/alerts', { params });
  }

  create(payload: NoteCreatePayload) {
    return this.http.post<{ noteId: string; message: string }>('/api/notes', payload);
  }

  update(id: string, payload: NoteCreatePayload) {
    return this.http.put<{ message: string }>(`/api/notes/${id}`, payload);
  }

  setActive(id: string, isActive: boolean) {
    return this.http.patch<{ message: string }>(`/api/notes/${id}/active`, { isActive });
  }

  delete(id: string) {
    return this.http.delete<{ message: string }>(`/api/notes/${id}`);
  }
}
