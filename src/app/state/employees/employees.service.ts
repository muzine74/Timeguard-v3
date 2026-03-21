import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, tap } from 'rxjs';
import { Employee, WorkDate, WorkStats } from '../../models';

interface EmployeePoco {
  employeeId:           string;
  nas:                  string;
  employeeName:         string;
  employeeMail:         string;
  employeePhone:        string;
  employeeNote:         string;
  addressId:            string;
  employeeCivicNumber:  string;
  employeeSuite:        string;
  employeeZipCode:      string;
  employeeCity:         string;
  employeeState:        string;
  employeeCountry:      string;
  employeeAdressNote:   string;
  employeeCompagnies:   { compagnieId: string; compagnieName: string }[];
}

@Injectable({ providedIn: 'root' })
export class EmployeesService {
  private _list    = signal<Employee[]>([]);
  private _loading = signal(false);
  private _error   = signal<string | null>(null);

  readonly list    = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error   = this._error.asReadonly();

  private log(...args: unknown[]): void {
    if (isDevMode()) console.log('[EmployeesService]', ...args);
  }

  private warn(...args: unknown[]): void {
    if (isDevMode()) console.warn('[EmployeesService]', ...args);
  }

  constructor(private http: HttpClient) {}

  private _map(p: EmployeePoco): Employee {
    return {
      employeeId:          p.employeeId,
      employeeName:        p.employeeName,
      employeeMail:        p.employeeMail,
      employeePhone:       p.employeePhone,
      employeeNote:        p.employeeNote,
      nas:                 p.nas,
      employeeCivicNumber: p.employeeCivicNumber,
      employeeSuite:       p.employeeSuite,
      employeeZipCode:     p.employeeZipCode,
      employeeCity:        p.employeeCity,
      employeeState:       p.employeeState,
      employeeCountry:     p.employeeCountry,
      employeeAdressNote:  p.employeeAdressNote,
      employeeCompagnies:  p.employeeCompagnies ?? [],
    };
  }

  // ── Liste ──────────────────────────────────────────────
  loadList(): void {
    this.log('loadList() → GET /api/employee');
    this._loading.set(true);
    this._error.set(null);

    this.http.get<EmployeePoco[]>('/api/employee').pipe(
      tap(raw => this.log(`réponse brute (${raw.length} employés)`, raw)),
      map(list => list.map(p => this._map(p))),
      tap(mapped => this.log('après _map()', mapped)),
    ).subscribe({
      next: d => {
        this._list.set(d);
        this._loading.set(false);
        this.log(`✓ ${d.length} employé(s) chargé(s)`);
      },
      error: err => {
        this.warn('✕ GET /api/employee échoué', err);
        this.warn(`  status: ${err.status} | message: ${err.message}`);
        this.warn('  → fallback sur données démo');
        this._error.set(`HTTP ${err.status} — ${err.message}`);
        this._list.set(this._demo());
        this._loading.set(false);
      }
    });
  }

  // ── Fiche employé ──────────────────────────────────────
  getOne(id: string) {
    this.log(`getOne(${id}) → GET /api/employee/${id}`);
    return this.http.get<EmployeePoco>(`/api/employee/${id}`).pipe(
      tap(raw  => this.log('getOne() réponse brute', raw)),
      map(p    => this._map(p)),
      tap(emp  => this.log('getOne() après _map()', emp)),
    );
  }

  update(id: string, patch: Partial<Employee>) {
    this.log(`update(${id})`, patch);
    return this.http.put<EmployeePoco>(`/api/employee/${id}`, patch).pipe(
      tap(raw => this.log('update() réponse brute', raw)),
      map(p   => this._map(p)),
    );
  }

  // ── WorkDates ──────────────────────────────────────────
  getWorkDates(empId: string, month?: string) {
    this.log(`getWorkDates(${empId}, month=${month})`);
    let p = new HttpParams();
    if (month) p = p.set('month', month);
    return this.http.get<WorkDate[]>(`/api/employee/${empId}/pointage`, { params: p }).pipe(
      tap(d => this.log(`getWorkDates() → ${d.length} entrée(s)`, d)),
    );
  }

  addWorkDate(empId: string, wd: Omit<WorkDate, 'id' | 'employeeId'>) {
    this.log(`addWorkDate(${empId})`, wd);
    return this.http.post<WorkDate>(`/api/employee/${empId}/pointage`, wd).pipe(
      tap(d => this.log('addWorkDate() → créé', d)),
    );
  }

  updateWorkDate(empId: string, wdId: number, patch: Partial<WorkDate>) {
    this.log(`updateWorkDate(${empId}, ${wdId})`, patch);
    return this.http.put<WorkDate>(`/api/employee/${empId}/pointage/${wdId}`, patch).pipe(
      tap(d => this.log('updateWorkDate() → mis à jour', d)),
    );
  }

  deleteWorkDate(empId: string, wdId: number) {
    this.log(`deleteWorkDate(${empId}, ${wdId})`);
    return this.http.delete<void>(`/api/employee/${empId}/pointage/${wdId}`).pipe(
      tap(() => this.log('deleteWorkDate() → supprimé')),
    );
  }

  getStats(empId: string, month?: string) {
    this.log(`getStats(${empId}, month=${month})`);
    let p = new HttpParams();
    if (month) p = p.set('month', month);
    return this.http.get<WorkStats>(`/api/employee/${empId}/stats`, { params: p }).pipe(
      tap(s => this.log('getStats() →', s)),
    );
  }

  // ── Demo fallback ──────────────────────────────────────
  private _demo(): Employee[] {
    this.warn('_demo() → données de test utilisées (API indisponible)');
    return [
      {
        employeeId:          '00000000-0000-0000-0000-000000000001',
        employeeName:        'Sophie Martin',
        employeeMail:        'sophie@co.com',
        employeePhone:       '514-555-0001',
        employeeNote:        '',
        nas:                 '123456789',
        employeeCity:        'Montréal',
        employeeState:       'QC',
        employeeCountry:     'Canada',
        employeeCivicNumber: '123',
        employeeSuite:       '',
        employeeZipCode:     'H1A 1A1',
        employeeAdressNote:  '',
        employeeCompagnies:  [],
      },
      {
        employeeId:          '00000000-0000-0000-0000-000000000002',
        employeeName:        'Lucas Bernard',
        employeeMail:        'lucas@co.com',
        employeePhone:       '514-555-0002',
        employeeNote:        '',
        nas:                 '987654321',
        employeeCity:        'Laval',
        employeeState:       'QC',
        employeeCountry:     'Canada',
        employeeCivicNumber: '456',
        employeeSuite:       'App 2',
        employeeZipCode:     'H7N 2B3',
        employeeAdressNote:  '',
        employeeCompagnies:  [],
      },
    ];
  }
}