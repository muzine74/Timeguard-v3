import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface StatsEmployeeRow {
  employeeId:            string;
  employeeName:          string;
  nbVisites:             number;
  totalPaiementEmploye:  number;
}

export interface StatsCompanyRow {
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
}
