// ── Domaine Auth ──────────────────────────────────────────
export interface User {
  username: string;
  employeeId: string;
  role: 'ADMIN' | 'USER';
}
export interface LoginRequest  { username: string; password: string; }
export interface LoginResponse { token: string;EmployeeId: string, username: string; role: string; }

// ── Domaine Employés ──────────────────────────────────────
export interface Employee {
  // ── Champs mappés depuis EmployeePoco ──
  employeeId:   string;          // Guid
  employeeName: string;          // EmployeeName
  employeeMail: string;          // EmployeeMail
  employeePhone?: string;        // EmployeePhone
  employeeNote?:  string;        // EmployeeNote
  nas?:           string;        // NAS (masqué)
  // Adresse
  employeeCivicNumber?: string;
  employeeSuite?:       string;
  employeeZipCode?:     string;
  employeeCity?:        string;
  employeeState?:       string;
  employeeCountry?:     string;
  employeeAdressNote?:  string;
  // Compagnies liées
  employeeCompagnies?:  EmployeeCompagnie[];
}

export interface EmployeeCompagnie {
  compagnieId:   string;
  compagnieName: string;
}

export interface WorkDate {
  id:         number;
  employeeId: number;
  date:       string;
  checkIn:    string;
  checkOut:   string | null;
  totalHours: number | null;
  status:     'present' | 'absent' | 'late' | 'half-day';
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
  id:        number;
  nom:       string;
  selected?: boolean;
  pointages?: Record<string, boolean>;
}

export interface WeekDay {
  dateKey:    string;
  labelFull:  string;
  labelShort: string;
  isToday:    boolean;
  isWeekend:  boolean;
}

export interface SavePayload {
  week:              string;
  pointagesEmployee: Record<number, Record<string, boolean>>;
  pointagesAdmin:    Record<number, Record<string, boolean>>;
}


// ── TimeLog (retour API pointage) ─────────────────────────────────────────────
export type WorkType = 'Regular' | 'Overtime' | 'Holiday' | 'Sick' | 'Vacation';
 
export interface TimeLogQueryResultDto {
  employeeId:  string;   // Guid
  companyId:   string;   // Guid
  companyName: string;
  note:        string;
  timeLogId:   string;   // Guid
  workDate:    string;   // DateOnly → "YYYY-MM-DD"
  beginWork:   string | null;  // DateTime?
  endWork:     string | null;
  clientPrice: number;
  workType:    WorkType;
}

// ── Compagnie (formulaire création) ──────────────────────────────────────────
export type FrequencePaiement  = 'Hebdomadaire' | 'Bi-hebdomadaire' | 'Bi-mensuel' | 'Mensuel';
export type FrequenceTravail   = 'Hebdomadaire' | 'Bi-hebdomadaire' | 'Bi-mensuel' | 'Mensuel';
 
export interface JourMensuel {
  jour:      number;
  actif:     boolean;
  compagnie: string;
  employe:   string;
}
 
export interface JourPlanning {
  actif:    boolean;
  compagnie: string;
  employe:   string;
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
 
export interface CompanyForm {
  // Infos générales
  companyName:   string;
  companyCode:   string;
  isActive:      boolean;
  providerId:    string;
  note:          string;
  // Adresse
  civicNumber:   string;
  suite:         string;
  city:          string;
  state:         string;
  country:       string;
  zipCode:       string;
  addressNote:   string;
  // Contact
  contactName:   string;
  contactMail:   string;
  contactPhone:  string;
  contactNote:   string;
  // Taxes
  tps:           string;
  tvq:           string;
  // Fréquences
  frequencePaiement: FrequencePaiement;
  frequenceTravail:  FrequenceTravail;
  // Planning mensuel — jours sélectionnés (1-31)
  joursBiMensuel: JourMensuel[];  // jours 1-15
  joursMensuel:   JourMensuel[];  // jours 1-31
  // Planning semaine 1
  semaine1: SemainePlanning;
  // Planning semaine 2 (Bi-hebdomadaire)
  semaine2: SemainePlanning;
}
 