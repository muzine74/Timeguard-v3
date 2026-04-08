// ── Domaine Auth ──────────────────────────────────────────
export interface User {
  username:   string;
  role:       'ADMIN' | 'USER' | 'SUPERADMIN';
  employeeId: string;
}
export interface LoginRequest  { username: string; password: string; }
export interface LoginResponse { token: string; username: string; role: string; employeeId: string; }

// ── Fichiers employé ──────────────────────────────────────
export interface EmployeeFile {
  id:           string;
  originalName: string;
  uploadedAt:   string;
}

// ── Domaine Employés ──────────────────────────────────────
export interface Employee {
  employeeId:           string;
  employeeName:         string;
  employeeMail:         string;
  employeePhone?:       string;
  employeeNote?:        string;
  nas?:                 string;
  isActive:             boolean;
  employeeCivicNumber?: string;
  employeeSuite?:       string;
  employeeZipCode?:     string;
  employeeCity?:        string;
  employeeState?:       string;
  employeeCountry?:     string;
  employeeAdressNote?:  string;
  employeeCompagnies?:  EmployeeCompagnie[];
}

export interface EmployeeCompagnie {
  compagnieId:   string;
  compagnieName: string;
}

// ── WorkDate / WorkStats (utilisés dans employee-details) ─
export type WorkDateStatus = 'present' | 'absent' | 'late' | 'half-day';

export interface WorkDate {
  id:         number;
  employeeId: number;
  date:       string;
  checkIn:    string;
  checkOut:   string | null;
  totalHours: number | null;
  status:     WorkDateStatus;
  note?:      string;
}

export interface WorkStats {
  totalDays:    number;
  presentDays:  number;
  absentDays:   number;
  lateDays:     number;
  totalHours:   number;
  averageHours: number;
}

// ── Domaine Pointage ──────────────────────────────────────
export interface Compagnie {
  id:         number;    // compteur local UI
  companyId:  string;    // Guid réel
  nom:        string;
  selected?:  boolean;
  pointages?: Record<string, boolean>;
}

export interface WeekDay {
  dateKey:    string;
  labelFull:  string;
  labelShort: string;
  isToday:    boolean;
  isWeekend:  boolean;
}

// Arch #7 : pointagesAdmin supprimé — ignoré par l'API
export interface SavePayload {
  employeeId:        string;
  week:              string;
  pointagesEmployee: Record<string, Record<string, boolean>>;
}

// ── TimeLog (retour API pointage) ─────────────────────────
export type WorkType = 'Regular' | 'Overtime' | 'Holiday' | 'Sick' | 'Vacation';

export interface TimeLogQueryResultDto {
  employeeId:  string;
  companyId:   string;
  companyName: string;
  note:        string;
  timeLogId:   string;
  workDate:    string;
  beginWork:   string | null;
  endWork:     string | null;
  clientPrice: number;
  workType:    WorkType;
}

// ── Compagnie (formulaire création) ──────────────────────
export type FrequencePaiement = 'hebdomadaire' | 'biHebdomadaire' | 'biMensuel' | 'mensuel';
export type FrequenceTravail  = 'hebdomadaire' | 'biHebdomadaire' | 'biMensuel' | 'mensuel';

export interface FreqOption {
  value: FrequenceTravail;
  label: string;
}

export interface JourMensuel {
  jour:      number;
  actif:     boolean;
  compagnie: number;
  employe:   number;
}

export interface JourPlanning {
  actif:     boolean;
  compagnie: number;
  employe:   number;
}

export interface SemainePlanning {
  lundi:    JourPlanning;
  mardi:    JourPlanning;
  mercredi: JourPlanning;
  jeudi:    JourPlanning;
  vendredi: JourPlanning;
  samedi:   JourPlanning;
  dimanche: JourPlanning;
}

// ── Employé (formulaire création / édition) ───────────────
export interface EmployeeForm {
  employeeName:        string;
  employeeMail:        string;
  employeePhone:       string;
  employeeNote:        string;
  nas:                 string;
  employeeCivicNumber: string;
  employeeSuite:       string;
  employeeZipCode:     string;
  employeeCity:        string;
  employeeState:       string;
  employeeCountry:     string;
  employeeAdressNote:  string;
}

// ── Historique tarifs ─────────────────────────────────
export interface PricingChangeItem {
  oldPrice:  number | null;  // null = premier override
  newPrice:  number;
  changedAt: string;         // ISO date
  isCurrent: boolean;
}

export interface DayPricingHistory {
  calendarId:   string;
  day:          string;
  defaultPrice: number;
  changes:      PricingChangeItem[];
}

// ── Tarifs employé (override) ──────────────────────────
export interface EmployeePricingEntry {
  calendarId:   string;
  day:          string;
  defaultPrice: number;
  customPrice:  number | null;
}

export interface PricingOverride {
  calendarId: string;
  price:      number | null;
}

export interface SavePricingPayload {
  overrides: PricingOverride[];
}

export interface CompanyForm {
  companyName:        string;
  companyCode:        string;
  isActive:           boolean;
  providerId:         string;
  note:               string;
  civicNumber:        string;
  suite:              string;
  city:               string;
  state:              string;
  country:            string;
  zipCode:            string;
  addressNote:        string;
  contactName:        string;
  contactMail:        string;
  contactPhone:       string;
  contactNote:        string;
  tps:                string;
  tvq:                string;
  frequencePaiement:  FrequencePaiement;
  frequenceTravail:   FrequenceTravail;
  joursBiMensuel:     JourMensuel[];
  joursMensuel:       JourMensuel[];
  semaine1:           SemainePlanning;
  semaine2:           SemainePlanning;
}
