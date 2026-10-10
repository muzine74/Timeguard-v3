import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface ChargeCompanyItem {
  companyId:  string;
  percentage: number;
}

export interface ChargeCompanyResponse extends ChargeCompanyItem {
  companyName: string;
  amount:      number;
}

export interface ChargeDocument {
  chargeDocumentId: string;
  originalName:     string;
  uploadedAt:        string;
}

export interface ChargePayload {
  title:       string;
  description?: string;
  amount:      number;
  /** Charge qui revient chaque mois (false = ponctuelle) : une copie est générée chaque mois, le même jour. */
  isMonthly:   boolean;
  /** Date de la charge, yyyy-MM-dd (première échéance d'une charge mensuelle). */
  chargeDate:  string;
  /** Le montant contient déjà les taxes (false = hors taxes). */
  taxIncluded: boolean;
  companies:   ChargeCompanyItem[];
}

export interface ChargeItem {
  chargeId:    string;
  title:       string;
  description?: string;
  amount:      number;
  isMonthly:   boolean;
  taxIncluded: boolean;
  createdAt:   string;
  /** Date de la charge, yyyy-MM-dd. */
  chargeDate:  string;
  /** Copie générée automatiquement à partir d'une charge mensuelle. */
  isGenerated: boolean;
  /** Charge mensuelle : date de la prochaine copie (yyyy-MM-dd). */
  nextDate?:   string | null;
  companies:   ChargeCompanyResponse[];
  documents:   ChargeDocument[];
}

@Injectable({ providedIn: 'root' })
export class ChargesService {
  constructor(private http: HttpClient) {}

  getAll() {
    return this.http.get<ChargeItem[]>('/api/charges');
  }

  getById(id: string) {
    return this.http.get<ChargeItem>(`/api/charges/${id}`);
  }

  create(payload: ChargePayload) {
    return this.http.post<{ chargeId: string; message: string }>('/api/charges', payload);
  }

  update(id: string, payload: ChargePayload) {
    return this.http.put<{ message: string }>(`/api/charges/${id}`, payload);
  }

  delete(id: string) {
    return this.http.delete<{ message: string }>(`/api/charges/${id}`);
  }

  uploadDocument(chargeId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ message: string; originalName: string }>(`/api/charges/${chargeId}/documents`, form);
  }

  downloadDocument(chargeId: string, documentId: string) {
    return this.http.get(`/api/charges/${chargeId}/documents/${documentId}/download`, { responseType: 'blob' as const });
  }

  deleteDocument(chargeId: string, documentId: string) {
    return this.http.delete<{ message: string }>(`/api/charges/${chargeId}/documents/${documentId}`);
  }
}
