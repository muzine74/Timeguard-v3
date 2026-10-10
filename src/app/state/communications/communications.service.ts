import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export type CommTargetType = 'company' | 'employee';
export type CommChannel    = 'email' | 'call' | 'meeting' | 'sms' | 'other';
export type CommDirection  = 'out' | 'in';

/** Compagnie ou employé de la liste de gauche. */
export interface CommTarget {
  id:       string;
  name:     string;
  isActive: boolean;
  count:    number;             // entrées dans l'historique
  lastAt:   string | null;      // ISO UTC
}

export interface CommTargets {
  companies:    CommTarget[];
  employees:    CommTarget[];
  canCompanies: boolean;        // permission « companies.edit »
  canEmployees: boolean;        // permission « employees.edit »
}

export interface Communication {
  id:          string;
  targetType:  CommTargetType;
  targetId:    string;
  occurredAt:  string;          // ISO UTC
  channel:     CommChannel;
  direction:   CommDirection;
  contact:     string | null;   // destinataires du courriel ou interlocuteur
  subject:     string;
  body:        string | null;
  attachment:  string | null;
  isAutomatic: boolean;         // envoi enregistré par TimeGuard : non modifiable
  error:       string | null;   // envoi échoué : message d'erreur
  createdBy:   string | null;
}

/** Entrée saisie à la main. */
export interface CommSave {
  targetType: CommTargetType;
  targetId:   string;
  occurredAt: string;           // ISO UTC
  channel:    CommChannel;
  direction:  CommDirection;
  contact:    string;
  subject:    string;
  body:       string;
}

@Injectable({ providedIn: 'root' })
export class CommunicationsService {
  constructor(private http: HttpClient) {}

  getTargets() { return this.http.get<CommTargets>('/api/communications/targets'); }

  get(targetType: CommTargetType, targetId: string) {
    const params = new HttpParams().set('targetType', targetType).set('targetId', targetId);
    return this.http.get<Communication[]>('/api/communications', { params });
  }

  add(req: CommSave)                { return this.http.post<Communication>('/api/communications', req); }
  update(id: string, req: CommSave) { return this.http.put<Communication>(`/api/communications/${id}`, req); }
  delete(id: string)                { return this.http.delete<void>(`/api/communications/${id}`); }
}
