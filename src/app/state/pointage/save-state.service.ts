import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, map, of, switchMap } from 'rxjs';
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
  private _saving           = signal(false);
  private _error            = signal(false);
  private _progress         = signal(0);
  private _locked           = signal(false);
  private _lockedAt         = signal<string | null>(null);
  private _earnings         = signal<WeekEarnings | null>(null);
  // Map weekStart → totalGain pour TOUTES les semaines non validées (y compris la courante)
  // L'exclusion de la semaine courante est faite dynamiquement dans le computed.
  private _nonValidatedMap = signal<Record<string, number>>({});
  private _unlockedWeeks   = signal<{ weekStart: string; totalGain: number }[]>([]);

  readonly isSaving      = this._saving.asReadonly();
  readonly progress      = this._progress.asReadonly();
  readonly isLocked      = this._locked.asReadonly();
  readonly lockedAt      = this._lockedAt.asReadonly();
  readonly earnings      = this._earnings.asReadonly();
  readonly unlockedWeeks = this._unlockedWeeks.asReadonly();
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
      weekTotal: this._ptEmp.weekTotal(), // signal computed — pas de paramètre
    };
  });

  /**
   * Gains non validés = toutes semaines non validées (API) sauf la courante
   *                    + semaine courante (live local, réactif aux coches).
   * _week.weekKey() est réactif → recalcule automatiquement à chaque navigation.
   */
  readonly cumulativeGain = computed(() => {
    const currentWeek = this._week.weekKey();
    const pastTotal = Object.entries(this._nonValidatedMap())
      .filter(([w]) => w !== currentWeek)
      .reduce((s, [, g]) => s + g, 0);
    return pastTotal + this._ptEmp.weekTotal();
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

  /**
   * Charge les gains des semaines passées non validées (hors semaine courante).
   * La semaine courante est gérée localement via weekTotal() pour rester réactive aux coches.
   * Appelé au chargement initial, après save / validate / unvalidate.
   */
  /**
   * Charge TOUTES les semaines non validées depuis l'API.
   * Stocke un Record<weekStart, totalGain> — l'exclusion de la semaine courante
   * est faite dynamiquement dans cumulativeGain (computed réactif à weekKey).
   */
  loadCumulativeEarnings(employeeId: string): void {
    if (!employeeId) return;
    this.getEmployeeWeekHistory(employeeId).pipe(
      switchMap(history => {
        const unlocked = history.filter(w => !w.isLocked);
        if (!unlocked.length) return of({ unlocked, earnings: [] as WeekEarnings[] });
        return forkJoin(
          unlocked.map(w =>
            this.http.get<WeekEarnings>(`/api/pointage/${employeeId}/${w.weekStart}/earnings`)
          )
        ).pipe(map(earnings => ({ unlocked, earnings })));
      })
    ).subscribe({
      next: ({ unlocked, earnings }) => {
        const mapRecord: Record<string, number> = {};
        const listItems: { weekStart: string; totalGain: number }[] = [];
        unlocked.forEach((w, i) => {
          const g = earnings[i]?.totalGain ?? 0;
          if (g > 0) {
            mapRecord[w.weekStart] = g;
            listItems.push({ weekStart: w.weekStart, totalGain: g });
          }
        });
        this._nonValidatedMap.set(mapRecord);
        this._unlockedWeeks.set(
          listItems.sort((a, b) => b.weekStart.localeCompare(a.weekStart))
        );
        this.log(`✓ ${listItems.length} semaine(s) non validée(s) avec pointage`);
      },
      error: () => { this._nonValidatedMap.set({}); this._unlockedWeeks.set([]); },
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

  async save(): Promise<boolean> {
    this.log('save() → début');
    this._saving.set(true); this._error.set(false); this._progress.set(10);
    try {
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
