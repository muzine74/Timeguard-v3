import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { SavePayload } from '../../models';
import { WeekService } from './week.service';
import { PointageEmployeeService } from './pointage-employee.service';
import { PointageAdminService } from './pointage-admin.service';

export interface DashStats    { emp: number; adm: number; companies: number; days: number; weekTotal: number; }
export interface PointageStatus { isLocked: boolean; validatedAt?: string; validatedById?: string; }

export interface CompanyEarnings { companyId: string; companyName: string; visits: number; subtotal: number; unitPrice: number; }
export interface WeekEarnings    { totalGain: number; isLocked: boolean; validatedAt?: string; companies: CompanyEarnings[]; }

@Injectable({ providedIn: 'root' })
export class SaveStateService {
  private _saving   = signal(false);
  private _error    = signal(false);
  private _progress = signal(0);
  private _locked   = signal(false);
  private _lockedAt = signal<string | null>(null);
  private _earnings = signal<WeekEarnings | null>(null);

  readonly isSaving  = this._saving.asReadonly();
  readonly progress  = this._progress.asReadonly();
  readonly isLocked  = this._locked.asReadonly();
  readonly lockedAt  = this._lockedAt.asReadonly();
  readonly earnings  = this._earnings.asReadonly();
  isError(): boolean { return this._error(); }

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[SaveStateSvc]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[SaveStateSvc]', ...a); }

  readonly stats = computed<DashStats>(() => {
    const days = this._week.weekDays();
    return {
      emp:       this._ptEmp.total(days),
      adm:       this._ptAdm.total(days),
      companies: this._ptEmp.compagnies().length,
      days:      days.length,
      weekTotal: this._ptEmp.weekTotal(days),
    };
  });

  constructor(
    private http:   HttpClient,
    private _week:  WeekService,
    private _ptEmp: PointageEmployeeService,
    private _ptAdm: PointageAdminService,
  ) {}

  getWeekStatuses(weekKey: string) {
    return this.http.get<{ employeeId: string; isLocked: boolean }[]>(
      `/api/pointage/status?week=${weekKey}`
    );
  }

  getAllValidatedStatuses() {
    return this.http.get<{ employeeId: string; allValidated: boolean }[]>('/api/pointage/statuses');
  }

  getEmployeeWeekHistory(employeeId: string) {
    return this.http.get<{ weekStart: string; isLocked: boolean }[]>(
      `/api/pointage/${employeeId}/weeks`
    );
  }

  loadEarnings(employeeId: string, weekKey: string): void {
    if (!employeeId) return;
    this._earnings.set(null);
    this.http.get<WeekEarnings>(`/api/pointage/${employeeId}/${weekKey}/earnings`).subscribe({
      next:  e  => this._earnings.set(e),
      error: () => this._earnings.set(null),
    });
  }

  loadStatus(employeeId: string, weekKey: string): void {
    if (!employeeId) return;
    this.http.get<PointageStatus>(`/api/pointage/${employeeId}/${weekKey}/status`).subscribe({
      next: s => {
        this._locked.set(s.isLocked);
        this._lockedAt.set(s.validatedAt ?? null);
      },
      error: () => this._locked.set(false),
    });
  }

  validateWeek(employeeId: string, weekKey: string, adminId: string) {
    return this.http.post(`/api/pointage/${employeeId}/${weekKey}/validate`, { adminId });
  }

  unvalidateWeek(employeeId: string, weekKey: string) {
    return this.http.delete(`/api/pointage/${employeeId}/${weekKey}/validate`);
  }

  // Bug #1 corrigé : catch retourne false, _error mis à true
  // Bug #3 corrigé : lastValueFrom() remplace toPromise() (déprécié)
  // Perf #12 : clearCache() après sauvegarde réussie
  async save(): Promise<boolean> {
    this.log('save() → début');
    this._saving.set(true); this._error.set(false); this._progress.set(10);
    try {
      // Arch #7 : pointagesAdmin supprimé du payload (ignoré par l'API)
      const payload: SavePayload = {
        employeeId:        this._ptEmp.getEmployeeId(),
        week:              this._week.weekKey(),
        pointagesEmployee: this._ptEmp.snapshot(),
      };
      this.log('payload:', payload);
      this._progress.set(40);
      await lastValueFrom(this.http.post('/api/save', payload));
      this._ptEmp.clearCache();
      this.loadEarnings(payload.employeeId, payload.week);
      this._progress.set(100);
      await new Promise(r => setTimeout(r, 400));
      this._saving.set(false); this._progress.set(0);
      this.log('✓ sauvegardé');
      return true;
    } catch (err: any) {
      this.warn('✕ save() échoué', err);
      this._error.set(true);
      this._progress.set(100);
      await new Promise(r => setTimeout(r, 400));
      this._saving.set(false); this._progress.set(0);
      return false;
    }
  }
}
