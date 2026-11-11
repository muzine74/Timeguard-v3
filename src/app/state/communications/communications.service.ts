import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AttachmentItem } from '../attachments/attachments.service';

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
  /** Lecture des courriels reçus (Microsoft 365) activée : les accusés de lecture mettent l'historique à jour tout seuls. */
  readReceiptTracked: boolean;
}

/** Accusé de lecture d'un courriel envoyé : demandé (en attente), lu, ou supprimé sans être lu. */
export type CommReadReceipt = 'requested' | 'read' | 'deleted';

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
  attachments: AttachmentItem[];
  // Appel passé depuis TimeGuard (null / faux pour toute autre entrée)
  callNumber:      string | null;
  callStatus:      'pending' | 'in-progress' | 'completed' | 'no-answer' | 'busy' | 'failed' | 'canceled' | null;
  durationSeconds: number | null;
  hasRecording:    boolean;
  // Accusé de lecture d'un courriel envoyé (null = pas demandé)
  readReceipt:   CommReadReceipt | null;
  readReceiptAt: string | null; // ISO UTC, premier accusé reçu
  readReceiptBy: string | null; // adresses qui ont renvoyé un accusé, séparées par « ; »
}

export interface CommEmail { label: string; email: string; }

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
  readReceipt: boolean;         // courriel « Envoyé » : demander un accusé de lecture à l'envoi
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

  /** Courriels des contacts actifs d'une compagnie, ou courriel de l'employé. */
  getEmails(targetType: CommTargetType, targetId: string) {
    const params = new HttpParams().set('targetType', targetType).set('targetId', targetId);
    return this.http.get<CommEmail[]>('/api/communications/emails', { params });
  }

  /** Envoie pour de bon un courriel saisi (avec ses pièces jointes). L'entrée revient envoyée (`isAutomatic`),
   *  ou avec `error` si le serveur de courriel a échoué. */
  send(id: string) { return this.http.post<Communication>(`/api/communications/${id}/send`, {}); }
}
