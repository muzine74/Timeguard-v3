import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** Page d'accueil. Une section absente (null) = pas la permission correspondante. */
export interface Dashboard {
  today:    string;                        // yyyy-MM-dd
  weeks:    DashboardWeeks    | null;
  invoices: DashboardInvoices | null;
  payments: DashboardPayments | null;
  charges:  DashboardCharges  | null;
  setup:    DashboardSetup    | null;
}

/** Premiers pas d'une nouvelle entreprise : ce qui existe déjà. */
export interface DashboardSetup {
  companyInfo: boolean; smtp: boolean; companies: number; employees: number; timeLogs: boolean; invoices: boolean; done: boolean;
}

/** Semaines pointées, terminées, pas encore validées. */
export interface DashboardWeeks {
  count:      number;                      // couples employé + semaine
  employees:  number;
  oldestWeek: string | null;               // lundi, yyyy-MM-dd
  top: { employeeId: string; employeeName: string; weeks: number; oldestWeek: string }[];
}

export interface DashboardInvoices {
  toSendCount: number;                     // enregistrées, pas encore envoyées
  toSendTotal: number;
  unpaidCount: number;                     // envoyées, pas encore payées
  unpaidTotal: number;                     // avec taxes, avoirs déduits
  lateCount:   number;                     // envoyées depuis plus de 30 jours
  oldest: { billIdentifier: number; billNumber: string; companyName: string; sentDate: string; days: number; total: number }[];
}

/** Versements enregistrés, pas encore transférés. */
export interface DashboardPayments { count: number; employees: number; total: number; }

/** Charges du mois en cours. */
export interface DashboardCharges { month: string; count: number; total: number; upcoming: number; }

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private http: HttpClient) {}
  get() { return this.http.get<Dashboard>('/api/dashboard'); }
}
