// ── Domaine Auth ──────────────────────────────────────────
export interface User {
  username:    string;
  permissions: string[];
  employeeId:  string;
  tenantId:    string;
  tenantSlug:  string;
  isSuperUser: boolean;
}

export interface LoginRequest {
  username:   string;
  password:   string;
  tenantSlug: string;  // identifiant de l'entreprise — requis
}

export interface LoginResponse {
  token:       string;
  username:    string;
  permissions: string[];
  employeeId:  string;
  tenantId:    string;
  tenantSlug:  string;
  isSuperUser: boolean;
}

export interface RegisterTenantRequest {
  companyName:   string;
  slug:          string;
  ownerEmail:    string;
  adminUsername: string;
  adminPassword: string;
  plan?:         string;
}

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
  employeeType?:        string;   // 'Permanent' | 'À la tâche'
  /** Rémunération : 'Visite' (planning) ou 'Heure' (heures × taux horaire). */
  modeRemuneration?:    'Visite' | 'Heure';
  /** Hiérarchie : chef d'équipe, et son chef / responsable direct (null = sans chef). */
  isTeamLead?:          boolean;
  managerId?:           string | null;
  managerName?:         string | null;
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
  prices?:    Record<string, number>;  // prix employé par dateKey (depuis timelogs)
  /** Saisie en heures : compagnie facturée à l'heure OU employé payé à l'heure. */
  hourly?:     boolean;
  /** Taux horaire payé applicable (aperçu du montant avant enregistrement). */
  hourlyRate?: number;
  /** Plages horaires saisies par dateKey (plusieurs par jour ; total du jour = somme). */
  hours?:      Record<string, HourEntry[]>;
}

export interface HourEntry { begin: string; end: string; }

/** Taux horaire payé d'un employé pour une compagnie « par heure » (GET /api/employee/{id}/hourly-rate/{companyId}). */
export interface EmployeeHourlyRate {
  isHourlyCompany:  boolean;
  isHourlyEmployee: boolean;                            // payé à l'heure chez cette compagnie (effectif)
  modeRemunerationCompagnie: 'Defaut' | 'Visite' | 'Heure';  // réglage de l'affectation
  modeRemunerationEmploye:   'Visite' | 'Heure';        // défaut de la fiche employé
  defaultRate:      number | null;
  specificRate:     number | null;
  effectiveRate:    number | null;
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
  /** Pointages horaires : companyId → dateKey → plages début/fin (HH:mm), plusieurs par jour. */
  plagesEmployee?:   Record<string, Record<string, HourEntry[]>>;
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
  isHourly?:   boolean;
  hourlyRate?: number | null;
  /** Plages horaires de la journée (pointage en heures). */
  ranges?:     HourEntry[] | null;
}

// ── Compagnie (formulaire création) ──────────────────────
export type FrequencePaiement = 'hebdomadaire' | 'biHebdomadaire' | 'biMensuel' | 'mensuel';
export type FrequenceTravail  = 'hebdomadaire' | 'biHebdomadaire' | 'biMensuel' | 'mensuel';

export interface FreqOption {
  value: FrequenceTravail;
  label: string;
}

export interface JourMensuel {
  jour:            number;
  actif:           boolean;
  compagnie:       number;
  employe:         number;
  applicatedDate?: string | null;  // "yyyy-MM-dd" or null = always applicable
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
  employeeType:        string;   // 'Permanent' | 'À la tâche'
  modeRemuneration:    'Visite' | 'Heure';
  /** Chef d'équipe (peut superviser des employés et d'autres chefs). */
  isTeamLead:          boolean;
  /** Chef d'équipe / responsable direct — obligatoire sauf chef au sommet. */
  managerId:           string | null;
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
  note:               string;
  civicNumber:        string;
  suite:              string;
  city:               string;
  state:              string;
  country:            string;
  zipCode:            string;
  addressNote:        string;
  tps:                string;
  tvq:                string;
  frequencePaiement:  FrequencePaiement;
  frequenceTravail:   FrequenceTravail;
  joursBiMensuel:     JourMensuel[];
  joursMensuel:       JourMensuel[];
  semaine1:           SemainePlanning;
  semaine2:           SemainePlanning;
  /** Bi-hebdomadaire : date (yyyy-MM-dd) où commence la Semaine 1 ; null = non renseignée. */
  debutSemaine1:      string | null;
  /** Facturation client : « Visite » (prix du planning) ou « Heure » (heures × taux horaire client). */
  modeFacturation:    'Visite' | 'Heure';
  /** Par heure : taux horaire facturé au client. */
  tauxHoraireClient:  number | null;
  /** Taux horaire payé par défaut aux employés rémunérés à l'heure (facultatif). */
  tauxHoraireEmploye: number | null;
}
