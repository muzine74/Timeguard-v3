import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface T4AData {
  employeeId: string;
  year: number;
  payerName: string;
  payerAccountNumber: string;
  lastName: string;
  firstName: string;
  initials: string;
  address: string;
  sin: string;
  recipientAccountNumber: string;
  pension: number;
  lumpSum: number;
  commissions: number;
  incomeTaxDeducted: number;
  annuities: number;
  feesForServices: number;
}

@Injectable({ providedIn: 'root' })
export class T4AService {
  constructor(private http: HttpClient) {}

  suggest(employeeId: string, year: number) {
    return this.http.get<T4AData & { error?: string }>('/api/t4a/suggest', {
      params: { employeeId, year: year.toString() },
    });
  }

  generate(data: T4AData) {
    return this.http.post('/api/t4a/generate', data, { responseType: 'blob' as const });
  }
}
