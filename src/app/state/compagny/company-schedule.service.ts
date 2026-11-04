import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export type ScheduleFrequency = 'Hebdomadaire' | 'BiHebdomadaire' | 'BiMensuel' | 'Mensuel';

export interface CompanyScheduleItem {
  companyId: string;
  name:      string;
  code:      string | null;
  frequency: ScheduleFrequency;
}

export interface CompanyScheduleDay {
  date:      string;                  // yyyy-MM-dd
  companies: CompanyScheduleItem[];
}

/** Compagnies actives à travailler chaque jour du mois, d'après leur planning. */
export interface CompanySchedule {
  month:      string;                 // yyyy-MM
  days:       CompanyScheduleDay[];
  /** Bi-hebdomadaires sans date de début : impossibles à placer. */
  incomplete: CompanyScheduleItem[];
  /** Employés actifs liés à chaque compagnie (clé = companyId), triés par nom. */
  employees:  Record<string, string[]>;
}

export const FREQUENCY_LABEL: Record<ScheduleFrequency, string> = {
  Hebdomadaire:   'Hebdomadaire',
  BiHebdomadaire: 'Bi-hebdomadaire',
  BiMensuel:      'Bi-mensuel',
  Mensuel:        'Mensuel',
};

@Injectable({ providedIn: 'root' })
export class CompanyScheduleService {
  constructor(private http: HttpClient) {}

  month(month: string) {
    return this.http.get<CompanySchedule>('/api/company-schedule', { params: new HttpParams().set('month', month) });
  }
}
