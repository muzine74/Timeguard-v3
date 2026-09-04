import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface StatsEmployeeRow {
  employeeId:            string;
  employeeName:          string;
  nbVisites:             number;
  totalPaiementEmploye:  number;
}

export interface StatsCompanyRow {
  companyId:    string;
  companyName:  string;
  companyCode:  string;
  nbFactures:   number;
  nbAvoirs:     number;
  nbVisites:    number;
  totalHT:      number;
  totalTPS:     number;
  totalTVQ:     number;
  totalTTC:     number;
  totalAvoirs:  number;
  montantPaye:  number;
  aPayee:       boolean;
}

export interface StatsResponse {
  dateDebut:          string;
  dateFin:            string;
  nbFactures:               number;
  nbCompagnies:             number;
  nbVisitesTotal:           number;
  totalHT:                  number;
  totalTPS:                 number;
  totalTVQ:                 number;
  totalTTC:                 number;
  totalPaye:                number;
  totalEnAttente:           number;
  totalPaiementsEmployes:   number;
  gain:                     number;
  parEmploye:               StatsEmployeeRow[];
  parCompagnie:             StatsCompanyRow[];
}

export interface StatsEmployeeCompanyItem {
  companyId:     string;
  companyName:   string;
  nbVisites:     number;
  totalPaiement: number;
  visitDates:    string[]; // yyyy-MM-dd
}

export interface StatsEmployeeDetailResponse {
  employeeId:   string;
  employeeName: string;
  dateDebut:    string;
  dateFin:      string;
  companies:    StatsEmployeeCompanyItem[];
}

export interface StatsCompanyEmployeeItem {
  employeeId:   string;
  employeeName: string;
  nbVisites:    number;
  workDates:    string[]; // yyyy-MM-dd — semaines validées uniquement
}

export interface StatsCompanyDetailResponse {
  companyId:   string;
  companyName: string;
  dateDebut:   string;
  dateFin:     string;
  employees:   StatsCompanyEmployeeItem[];
}

/** Params de plage de dates communs — mêmes règles que GET /api/stats. */
export interface StatsRangeParams {
  period?: string;
  from?:   string;
  to?:     string;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  constructor(private http: HttpClient) {}

  getByPeriod(period: string) {
    const params = new HttpParams().set('period', period);
    return this.http.get<StatsResponse>('/api/stats', { params });
  }

  getByRange(from: string, to: string) {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<StatsResponse>('/api/stats', { params });
  }

  getEmployeeDetail(employeeId: string, range: StatsRangeParams) {
    return this.http.get<StatsEmployeeDetailResponse>(
      `/api/stats/employee/${employeeId}`, { params: this._toParams(range) }
    );
  }

  getCompanyDetail(companyId: string, range: StatsRangeParams) {
    return this.http.get<StatsCompanyDetailResponse>(
      `/api/stats/company/${companyId}`, { params: this._toParams(range) }
    );
  }

  private _toParams(range: StatsRangeParams): HttpParams {
    let params = new HttpParams();
    if (range.period) params = params.set('period', range.period);
    if (range.from)   params = params.set('from', range.from);
    if (range.to)     params = params.set('to', range.to);
    return params;
  }
}
