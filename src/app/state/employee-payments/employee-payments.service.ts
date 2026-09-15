import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface EmployeePaymentRow {
  employeeId: string;
  employeeName: string;
  gainCumule: number;
  amountPaid: number;
  note: string | null;
}

export interface EmployeePaymentSavePayload {
  employeeId: string;
  periodStart: string; // yyyy-MM-dd
  periodEnd: string;   // yyyy-MM-dd
  amountPaid: number;
  note: string | null;
}

@Injectable({ providedIn: 'root' })
export class EmployeePaymentsService {
  constructor(private http: HttpClient) {}

  getSummary(employeeIds: string[], from: string, to: string) {
    return this.http.get<EmployeePaymentRow[]>('/api/employee-payments/summary', {
      params: { employeeIds: employeeIds.join(','), from, to },
    });
  }

  save(payload: EmployeePaymentSavePayload) {
    return this.http.post<EmployeePaymentRow>('/api/employee-payments', payload);
  }
}
