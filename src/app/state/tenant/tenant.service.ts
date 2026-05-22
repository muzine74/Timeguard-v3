import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { LoginResponse } from '../../models';

export interface TenantSummary {
  tenantId:      string;
  name:          string;
  slug:          string;
  plan:          string;
  isActive:      boolean;
  employeeCount: number;
  createdAt:     string;
}

export interface TenantAdmin {
  credentialId: number;
  username:     string;
  employeeName: string;
}

export interface TenantDetail extends TenantSummary {
  ownerEmail: string;
  admins:     TenantAdmin[];
}

export interface TenantEmployeeItem {
  employeeId: string;
  name:       string;
  hasAccount: boolean;
}

export interface CreateAdminPayload {
  employeeId?:  string;
  employeeName: string;
  username:     string;
  password:     string;
}

@Injectable({ providedIn: 'root' })
export class TenantService {
  private _list    = signal<TenantSummary[]>([]);
  private _loading = signal(false);

  readonly list    = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();

  constructor(private http: HttpClient) {}

  loadAll() {
    this._loading.set(true);
    return this.http.get<TenantSummary[]>('/api/tenants').pipe(
      tap({
        next:  list => { this._list.set(list); this._loading.set(false); },
        error: ()   => this._loading.set(false),
      })
    );
  }

  getById(tenantId: string) {
    return this.http.get<TenantDetail>(`/api/tenants/${tenantId}`);
  }

  register(payload: {
    companyName: string; slug: string; ownerEmail: string;
    adminUsername: string; adminPassword: string; plan?: string;
  }) {
    return this.http.post<{ tenantId: string }>('/api/tenants/register', payload).pipe(
      tap(() => this.loadAll().subscribe())
    );
  }

  setActive(tenantId: string, isActive: boolean) {
    return this.http.patch(`/api/tenants/${tenantId}/active`, isActive).pipe(
      tap(() => {
        this._list.update(l => l.map(t =>
          t.tenantId === tenantId ? { ...t, isActive } : t
        ));
      })
    );
  }

  createAdmin(tenantId: string, payload: CreateAdminPayload) {
    return this.http.post<TenantAdmin>(`/api/tenants/${tenantId}/admins`, payload);
  }

  deleteAdmin(tenantId: string, credentialId: number) {
    return this.http.delete(`/api/tenants/${tenantId}/admins/${credentialId}`);
  }

  getEmployees(tenantId: string) {
    return this.http.get<TenantEmployeeItem[]>(`/api/tenants/${tenantId}/employees`);
  }

  impersonate(tenantId: string, credentialId: number) {
    return this.http.post<LoginResponse>(
      `/api/tenants/${tenantId}/admins/${credentialId}/impersonate`, {}
    );
  }
}
