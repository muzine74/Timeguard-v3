import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Employee, WorkDate, WorkStats } from '../../models';

@Injectable({ providedIn: 'root' })
export class EmployeesService {
  private _list    = signal<Employee[]>([]);
  private _loading = signal(false);

  readonly list    = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) {}

  // ── Liste ──────────────────────────────────────────────
  loadList(): void {
    this._loading.set(true);
    this.http.get<Employee[]>('/api/employees').subscribe({
      next: d  => { this._list.set(d);           this._loading.set(false); },
      error: () => { this._list.set(this._demo()); this._loading.set(false); }
    });
  }

  getOne(id: number) {
    return this.http.get<Employee>(`/api/employees/${id}`);
  }

  update(id: number, patch: Partial<Employee>) {
    return this.http.put<Employee>(`/api/employees/${id}`, patch);
  }

  // ── WorkDates ──────────────────────────────────────────
  getWorkDates(empId: number, month?: string) {
    let p = new HttpParams();
    if (month) p = p.set('month', month);
    return this.http.get<WorkDate[]>(`/api/employees/${empId}/pointage`, { params: p });
  }

  addWorkDate(empId: number, wd: Omit<WorkDate, 'id' | 'employeeId'>) {
    return this.http.post<WorkDate>(`/api/employees/${empId}/pointage`, wd);
  }

  updateWorkDate(empId: number, wdId: number, patch: Partial<WorkDate>) {
    return this.http.put<WorkDate>(`/api/employees/${empId}/pointage/${wdId}`, patch);
  }

  deleteWorkDate(empId: number, wdId: number) {
    return this.http.delete<void>(`/api/employees/${empId}/pointage/${wdId}`);
  }

  getStats(empId: number, month?: string) {
    let p = new HttpParams();
    if (month) p = p.set('month', month);
    return this.http.get<WorkStats>(`/api/employees/${empId}/stats`, { params: p });
  }

  // ── Demo fallback ──────────────────────────────────────
  private _demo(): Employee[] {
    return [
      { id:1, firstName:'Sophie',  lastName:'Martin',  email:'sophie@co.com', department:'Informatique', position:'Dev Senior',    status:'active',   hireDate:'2021-03-01' },
      { id:2, firstName:'Lucas',   lastName:'Bernard', email:'lucas@co.com',  department:'Finance',      position:'Analyste',      status:'active',   hireDate:'2020-06-15' },
      { id:3, firstName:'Emma',    lastName:'Durand',  email:'emma@co.com',   department:'RH',           position:'Chargée RH',    status:'active',   hireDate:'2022-01-10' },
      { id:4, firstName:'Nathan',  lastName:'Petit',   email:'nathan@co.com', department:'Marketing',    position:'Designer',      status:'inactive', hireDate:'2019-11-20' },
      { id:5, firstName:'Camille', lastName:'Leroy',   email:'camille@co.com',department:'Opérations',   position:'Chef de projet', status:'active',  hireDate:'2023-02-28' },
    ];
  }
}
