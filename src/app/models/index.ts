// ── Domaine Auth ──────────────────────────────────────────
export interface User {
  username: string;
  role: 'ADMIN' | 'USER';
}
export interface LoginRequest  { username: string; password: string; }
export interface LoginResponse { token: string; username: string; role: string; }

// ── Domaine Employés ──────────────────────────────────────
export interface Employee {
  id:         number;
  firstName:  string;
  lastName:   string;
  email:      string;
  phone?:     string;
  department: string;
  position:   string;
  status:     'active' | 'inactive';
  hireDate:   string;
  nas?:       string;
  adresse?:   string;
  note?:      string;
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
