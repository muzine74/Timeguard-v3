import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DayPricingHistory, EmployeeHourlyRate, EmployeePricingEntry, SavePricingPayload } from '../../models';

@Injectable({ providedIn: 'root' })
export class PricingService {
  constructor(private http: HttpClient) {}

  getPricing(employeeId: string, companyId: string): Observable<EmployeePricingEntry[]> {
    return this.http.get<EmployeePricingEntry[]>(
      `/api/employee/${employeeId}/pricing/${companyId}`
    );
  }

  savePricing(employeeId: string, companyId: string, payload: SavePricingPayload): Observable<unknown> {
    return this.http.put(
      `/api/employee/${employeeId}/pricing/${companyId}`,
      payload
    );
  }

  getHourlyRate(employeeId: string, companyId: string): Observable<EmployeeHourlyRate> {
    return this.http.get<EmployeeHourlyRate>(`/api/employee/${employeeId}/hourly-rate/${companyId}`);
  }

  /** hourlyRate = null → taux par défaut de la compagnie ; modeRemuneration : 'Defaut' | 'Visite' | 'Heure'. */
  saveHourlyRate(employeeId: string, companyId: string, hourlyRate: number | null,
                 modeRemuneration?: 'Defaut' | 'Visite' | 'Heure'): Observable<unknown> {
    return this.http.put(`/api/employee/${employeeId}/hourly-rate/${companyId}`, { hourlyRate, modeRemuneration });
  }

  getHistory(employeeId: string, companyId: string): Observable<DayPricingHistory[]> {
    return this.http.get<DayPricingHistory[]>(
      `/api/employee/${employeeId}/pricing/${companyId}/history`
    );
  }
}
