import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface EmployeePaymentDayCompany {
  companyId?: string;   // absent sur une ancienne API : repli sur le nom
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
  /** Taxes figées par le serveur au dernier enregistrement (réponse de save). */
  tpsAmount?: number | null;
  tvqAmount?: number | null;
  workDays: EmployeePaymentWorkDay[];
}

/** Un versement d'une semaine (une semaine peut en avoir plusieurs). */
export interface EmployeePaymentInstallment {
  id: string;
  amount: number;        // avant taxes
  tpsAmount: number;
  tvqAmount: number;
  total: number;         // montant réel transféré = amount + taxes
  paymentDate: string | null;   // yyyy-MM-dd
  isTransferred: boolean;
  note: string | null;
  savedAt: string;       // ISO UTC
  /** Répartition du montant (avant taxes) par journée couverte : yyyy-MM-dd → montant. */
  byDay?: Record<string, number>;
}

export interface EmployeeInstallmentPayload {
  employeeId: string;
  periodStart: string;   // lundi
  periodEnd: string;     // dimanche
  amount: number;        // avant taxes ; plafonné par le serveur au reste à verser
  note: string | null;
  paidDates: string[];   // journées cochées (= total sélectionné)
  paymentDate: string;
  isTransferred: boolean;
}

/** Semaine VALIDÉE (lundi → dimanche) avec ses versements enregistrés. */
export interface EmployeePaymentWeek {
  weekStart: string;          // yyyy-MM-dd (lundi)
  weekEnd: string;            // yyyy-MM-dd (dimanche)
  total: number;
  amountPaid: number | null;  // montant AVANT taxes ; null = jamais enregistré
  /** Taxes figées à l'enregistrement ; null = jamais enregistré ou paiement antérieur à cette fonction. */
  tpsAmount?: number | null;
  tvqAmount?: number | null;
  /** Taux (%) applicables aujourd'hui à l'employé : 0 s'il n'a pas le numéro de taxe correspondant. */
  tpsRate?: number;
  tvqRate?: number;
  note: string | null;
  /** Versements enregistrés, du plus ancien au plus récent (amountPaid en est la somme). */
  payments?: EmployeePaymentInstallment[];
  paidDates?: string[] | null; // journées payées enregistrées ; null/absent = non mémorisé
  paidAt?: string | null;      // ISO UTC du dernier enregistrement ; null = jamais enregistré
  paymentDate?: string | null; // date de paiement choisie (yyyy-MM-dd)
  isTransferred?: boolean;     // case « Paiement transféré » enregistrée
  workDays: EmployeePaymentWorkDay[];
}

/** Une ligne d'historique : un clic « Enregistrer » sur un paiement. */
export interface EmployeePaymentHistoryItem {
  changedAt: string;            // ISO UTC
  changedBy: string | null;
  previousAmount: number | null; // null = premier enregistrement
  newAmount: number;
  delta: number;                // positif ou négatif
  paidDates: string[] | null;
  note: string | null;
  paymentDate?: string | null;    // yyyy-MM-dd
  isTransferred?: boolean | null; // null = enregistrement antérieur à cette fonction
  tpsAmount?: number | null;      // taxes figées à cette date
  tvqAmount?: number | null;
}

export interface EmployeePaymentSavePayload {
  employeeId: string;
  periodStart: string; // yyyy-MM-dd
  periodEnd: string;   // yyyy-MM-dd
  amountPaid: number;
  note: string | null;
  /** Journées payées ; omis = valeur enregistrée inchangée. */
  paidDates?: string[];
  /** Date de paiement (yyyy-MM-dd) ; omis = inchangée. */
  paymentDate?: string;
  /** Case « Paiement transféré » ; omis = inchangée. */
  isTransferred?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmployeePaymentsService {
  constructor(private http: HttpClient) {}

  getSummary(employeeIds: string[], from: string, to: string) {
    return this.http.get<EmployeePaymentRow[]>('/api/employee-payments/summary', {
      params: { employeeIds: employeeIds.join(','), from, to },
    });
  }

  /** Semaines validées d'un employé (pointages validés uniquement), plus récentes d'abord. */
  getValidatedWeeks(employeeId: string, from: string, to: string) {
    return this.http.get<EmployeePaymentWeek[]>('/api/employee-payments/validated-weeks', {
      params: { employeeId, from, to },
    });
  }

  /** Ajoute un versement à une semaine validée. */
  addInstallment(payload: EmployeeInstallmentPayload) {
    return this.http.post<EmployeePaymentInstallment>('/api/employee-payments/installments', payload);
  }

  /** Coche / décoche « Paiement transféré » sur un versement enregistré. */
  setInstallmentTransferred(id: string, isTransferred: boolean, paymentDate?: string) {
    return this.http.put<EmployeePaymentInstallment>(`/api/employee-payments/installments/${id}/transferred`, { isTransferred, paymentDate });
  }

  /** Annule un versement ; l'historique garde la trace. */
  deleteInstallment(id: string) {
    return this.http.delete<void>(`/api/employee-payments/installments/${id}`);
  }

  /** Annule l'enregistrement d'un paiement (employé + période exacte) ; l'historique garde la trace. */
  cancel(employeeId: string, periodStart: string, periodEnd: string) {
    return this.http.delete<void>('/api/employee-payments', { params: { employeeId, periodStart, periodEnd } });
  }

  /** Historique des enregistrements d'un paiement (employé + période exacte), plus récent d'abord. */
  getHistory(employeeId: string, periodStart: string, periodEnd: string) {
    return this.http.get<EmployeePaymentHistoryItem[]>('/api/employee-payments/history', {
      params: { employeeId, periodStart, periodEnd },
    });
  }

  save(payload: EmployeePaymentSavePayload) {
    return this.http.post<EmployeePaymentRow>('/api/employee-payments', payload);
  }
}
