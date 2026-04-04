import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, tap } from 'rxjs';
import { Employee, EmployeeForm } from '../../models';

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

  // Mapper adapté au format réel de l'API :
  // { employeeId, nas, name, mail, phone, note, address:{civicNumber,suite,zipCode,city,state,country,note}, companies:[...] }
  private _map(raw: any): Employee {
    const addr = raw['address'] ?? {};
    const rawCompanies: any[] = raw['companies'] ?? raw['employeeCompagnies'] ?? raw['EmployeeCompagnies'] ?? [];
    const compagnies = rawCompanies.map((c: any) => ({
      compagnieId:   c['companyId']   ?? c['compagnieId']   ?? c['CompagnieId']   ?? c['id']   ?? '',
      compagnieName: c['companyName'] ?? c['compagnieName'] ?? c['CompagnieName'] ?? c['name'] ?? '',
    }));
    return {
      employeeId:          raw['employeeId']      ?? raw['EmployeeId']      ?? '',
      employeeName:        raw['name']            ?? raw['employeeName']    ?? raw['EmployeeName']    ?? '',
      employeeMail:        raw['mail']            ?? raw['employeeMail']    ?? raw['EmployeeMail']    ?? '',
      employeePhone:       raw['phone']           ?? raw['employeePhone']   ?? raw['EmployeePhone']   ?? '',
      employeeNote:        raw['note']            ?? raw['employeeNote']    ?? raw['EmployeeNote']    ?? '',
      nas:                 raw['nas']             ?? raw['NAS']             ?? '',
      employeeCivicNumber: addr['civicNumber']    ?? addr['CivicNumber']    ?? raw['employeeCivicNumber'] ?? '',
      employeeSuite:       addr['suite']          ?? addr['Suite']          ?? raw['employeeSuite']   ?? '',
      employeeZipCode:     addr['zipCode']        ?? addr['ZipCode']        ?? raw['employeeZipCode'] ?? '',
      employeeCity:        addr['city']           ?? addr['City']           ?? raw['employeeCity']    ?? '',
      employeeState:       addr['state']          ?? addr['State']          ?? raw['employeeState']   ?? '',
      employeeCountry:     addr['country']        ?? addr['Country']        ?? raw['employeeCountry'] ?? '',
      employeeAdressNote:  addr['note']           ?? addr['Note']           ?? raw['employeeAdressNote'] ?? '',
      employeeCompagnies:  compagnies,
    };
  }

  // ── Liste ──────────────────────────────────────────────
  loadList(): void {
    this.log('loadList() → GET /api/employee');
    this._loading.set(true);
    this._error.set(null);

    this.http.get<unknown>('/api/employee').pipe(
      map(raw => {
        const list: any[] = Array.isArray(raw)
          ? raw as any[]
          : Array.isArray((raw as any)?.data)       ? (raw as any).data
          : Array.isArray((raw as any)?.result)     ? (raw as any).result
          : Array.isArray((raw as any)?.employees)  ? (raw as any).employees
          : [];
        return list.map(p => this._map(p));
      }),
    ).subscribe({
      next: d => {
        this._list.set(d);
        this._loading.set(false);
        this.log(`✓ ${d.length} employé(s)`);
      },
      error: err => {
        this.warn('✕ GET /api/employee échoué', err.status);
        this._error.set(`Impossible de charger les employés — HTTP ${err.status}`);
        this._loading.set(false);
      }
    });
  }

  // ── Fiche employé ──────────────────────────────────────
  getOne(id: string) {
    this.log(`getOne(${id}) → GET /api/employee/${id}`);
    return this.http.get<any>(`/api/employee/${id}`).pipe(
      map(p => this._map(p)),
    );
  }

  create(form: EmployeeForm) {
    this.log('create() → POST /api/employee');
    this._loading.set(true);
    this._error.set(null);
    return this.http.post<{ employeeId: string; message: string }>('/api/employee', {
      employeeName:        form.employeeName,
      employeeMail:        form.employeeMail,
      employeePhone:       form.employeePhone,
      employeeNote:        form.employeeNote,
      nas:                 form.nas,
      employeeCivicNumber: form.employeeCivicNumber,
      employeeSuite:       form.employeeSuite,
      employeeZipCode:     form.employeeZipCode,
      employeeCity:        form.employeeCity,
      employeeState:       form.employeeState,
      employeeCountry:     form.employeeCountry,
      employeeAdressNote:  form.employeeAdressNote,
    }).pipe(
      tap({
        next:  () => this._loading.set(false),
        error: err => { this._error.set(`HTTP ${err.status}`); this._loading.set(false); },
      }),
    );
  }

  // Arch #6 : update() (patch partiel mort) supprimé — utiliser updateFull()
  updateFull(id: string, form: EmployeeForm) {
    this.log(`updateFull(${id}) → PUT /api/employee/${id}`);
    this._loading.set(true);
    this._error.set(null);
    return this.http.put<{ employeeId: string; message: string }>(`/api/employee/${id}`, {
      employeeName:        form.employeeName,
      employeeMail:        form.employeeMail,
      employeePhone:       form.employeePhone,
      employeeNote:        form.employeeNote,
      nas:                 form.nas,
      employeeCivicNumber: form.employeeCivicNumber,
      employeeSuite:       form.employeeSuite,
      employeeZipCode:     form.employeeZipCode,
      employeeCity:        form.employeeCity,
      employeeState:       form.employeeState,
      employeeCountry:     form.employeeCountry,
      employeeAdressNote:  form.employeeAdressNote,
    }).pipe(
      tap({
        next:  () => this._loading.set(false),
        error: err => { this._error.set(`HTTP ${err.status}`); this._loading.set(false); },
      }),
    );
  }

  // ── Compagnies assignées ───────────────────────────────
  assignCompany(employeeId: string, companyId: string) {
    this.log(`assignCompany(${employeeId}, ${companyId})`);
    return this.http.post<void>(`/api/employee/${employeeId}/companies/${companyId}`, {});
  }

  unassignCompany(employeeId: string, companyId: string) {
    this.log(`unassignCompany(${employeeId}, ${companyId})`);
    return this.http.delete<void>(`/api/employee/${employeeId}/companies/${companyId}`);
  }

  // ── WorkDates ─────────────────────────────────────────
  getWorkDates(empId: string, month?: string) {
    let p = new HttpParams();
    if (month) p = p.set('month', month);
    return this.http.get<any[]>(`/api/employee/${empId}/timelogs`, { params: p });
  }

  addWorkDate(empId: string, wd: object) {
    return this.http.post<any>(`/api/employee/${empId}/timelogs`, wd);
  }

  updateWorkDate(empId: string, wdId: number, patch: object) {
    return this.http.put<any>(`/api/employee/${empId}/timelogs/${wdId}`, patch);
  }

  deleteWorkDate(empId: string, wdId: number) {
    return this.http.delete<void>(`/api/employee/${empId}/timelogs/${wdId}`);
  }

  getStats(empId: string, month?: string) {
    let p = new HttpParams();
    if (month) p = p.set('month', month);
    return this.http.get<any>(`/api/employee/${empId}/stats`, { params: p });
  }
}
