import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface EmployeePaymentDayCompany {
  name: string;
  amount: number;
}

export interface EmployeePaymentWorkDay {
  date: string; // yyyy-MM-dd
  amount: number;
  companies: EmployeePaymentDayCompany[];
}

export interface EmployeePaymentRow {
  employeeId: string;
  employeeName: string;
  gainCumule: number;
  amountPaid: number;
  note: string | null;
  workDays: EmployeePaymentWorkDay[];
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
