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
  ownerCompanyId: string;
  title:       string;
  description?: string;
  amount:      number;
  companies:   ChargeCompanyItem[];
}

export interface ChargeItem {
  chargeId:    string;
  ownerCompanyId:   string;
  ownerCompanyName: string;
  title:       string;
  description?: string;
  amount:      number;
  createdAt:   string;
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
