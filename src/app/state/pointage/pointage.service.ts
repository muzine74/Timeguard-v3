import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Compagnie, WeekDay, SavePayload, TimeLogQueryResultDto } from '../../models';

// ── WeekService ────────────────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class WeekService {
  private _anchor = signal<Date>(this._monday(new Date()));

  readonly anchor   = this._anchor.asReadonly();
  readonly weekKey  = computed(() => this._fmt(this._anchor()));
  readonly weekDays = computed<WeekDay[]>(() => {
    const mon   = this._anchor();
    const today = new Date(); today.setHours(0,0,0,0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return {
        dateKey:    this._fmt(d),
        labelFull:  this._full(d),
        labelShort: this._short(d),
        isToday:    d.getTime() === today.getTime(),
        isWeekend:  d.getDay() === 0 || d.getDay() === 6,
      };
    });
  });
  readonly weekLabel = computed(() => {
    const d = this.weekDays();
    return `Semaine du ${d[0].labelFull} au ${d[6].labelFull}`;
  });

  setDate(d: Date):    void { this._anchor.set(this._monday(d)); }
  shift(days: number): void { const d = new Date(this._anchor()); d.setDate(d.getDate()+days); this._anchor.set(this._monday(d)); }
  goToday():           void { this._anchor.set(this._monday(new Date())); }

  private _monday(d: Date): Date {
    const c = new Date(d); c.setHours(0,0,0,0);
    const day = c.getDay(); c.setDate(c.getDate() + (day===0 ? -6 : 1-day));
    return c;
  }
  private _fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  private readonly _D  = ['Di','Lu','Ma','Me','Je','Ve','Sa'];
  private readonly _DF = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  private readonly _M  = ['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'];
  private _full(d: Date):  string { return `${this._DF[d.getDay()]} ${d.getDate()} ${this._M[d.getMonth()]}`; }
  private _short(d: Date): string { return `${this._D[d.getDay()]} ${d.getDate()}`; }
}

// ── PointageEmployeeService ────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class PointageEmployeeService {
  private _compagnies  = signal<Compagnie[]>([]);
  private _loading     = signal(false);
  private _cache       = new Map<string, Record<number, Record<string, boolean>>>();
  private _currentWeek = '';

  readonly compagnies = this._compagnies.asReadonly();
  readonly isLoading  = this._loading.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[PointageEmpSvc]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[PointageEmpSvc]', ...a); }

  constructor(private http: HttpClient) {}

  load(weekKey: string, employeeId?: string): void {
    this.log(`load(weekKey=${weekKey}, employeeId=${employeeId ?? 'undefined'})`);

    // Sauvegarder la semaine courante avant de changer
    if (this._currentWeek && this._currentWeek !== weekKey) {
      const snap = this.snapshot();
      this._cache.set(this._currentWeek, snap);
      this.log(`cache sauvegardé → semaine ${this._currentWeek}`, snap);
    }
    this._currentWeek = weekKey;

    // Restaurer depuis le cache si disponible
    const cached = this._cache.get(weekKey);
    if (cached) {
      this.log(`cache hit → semaine ${weekKey}`, cached);
      this._compagnies.update(l => l.map(c => ({
        ...c, pointages: cached[c.id] ?? {}
      })));
      this.log(`compagnies restaurées: ${this._compagnies().length}`);
      return;
    }

    if (!employeeId) {
      this.warn('employeeId manquant → fallback démo');
      this._compagnies.set(this._demo());
      return;
    }

    this._loading.set(true);
    const url = `/api/Employee/${employeeId}/${weekKey}`;
    this.log(`GET ${url}`);

    this.http.get<TimeLogQueryResultDto[]>(url).subscribe({
      next: logs => {
        this.log(`✓ réponse: ${logs.length} timelog(s)`);
        this.log('timelogs bruts:', logs);

        const compagnies = this._fromTimeLogs(logs);
        this.log(`compagnies générées: ${compagnies.length}`, compagnies);

        this._compagnies.set(compagnies);
        this._cache.set(weekKey, this.snapshot());
        this._loading.set(false);
      },
      error: err => {
        this.warn(`✕ GET ${url} échoué`);
        this.warn(`  status:  ${err.status}`);
        this.warn(`  message: ${err.message}`);
        this.warn(`  body:   `, err.error);
        this._compagnies.set(this._demo());
        this._loading.set(false);
      }
    });
  }

  private _fromTimeLogs(logs: TimeLogQueryResultDto[]): Compagnie[] {
    const map = new Map<string, { id: number; nom: string; pointages: Record<string, boolean> }>();
    let idCounter = 1;

    for (const log of logs) {
      if (!map.has(log.companyId)) {
        map.set(log.companyId, { id: idCounter++, nom: log.companyName, pointages: {} });
      }
      const comp = map.get(log.companyId)!;
      if (log.workDate) comp.pointages[log.workDate] = true;
    }

    const result = Array.from(map.values()).map(c => ({ ...c, selected: false }));
    this.log('_fromTimeLogs() →', result);
    return result;
  }

  toggle(compId: number, dateKey: string): void {
    this.log(`toggle(compId=${compId}, dateKey=${dateKey})`);
    this._compagnies.update(l => l.map(c => c.id !== compId ? c : {
      ...c, pointages: { ...c.pointages, [dateKey]: !c.pointages?.[dateKey] }
    }));
    if (this._currentWeek) this._cache.set(this._currentWeek, this.snapshot());
  }

  selectAll(days: WeekDay[]): void {
    this.log(`selectAll(${days.length} jours)`);
    this._compagnies.update(l => l.map(c => ({
      ...c, pointages: Object.fromEntries(days.map(d => [d.dateKey, true]))
    })));
    if (this._currentWeek) this._cache.set(this._currentWeek, this.snapshot());
  }

  clearAll(): void {
    this.log('clearAll()');
    this._compagnies.update(l => l.map(c => ({ ...c, pointages: {} })));
    if (this._currentWeek) this._cache.set(this._currentWeek, this.snapshot());
  }

  clearCache(): void { this.log('clearCache()'); this._cache.clear(); }

  isChecked(c: Compagnie, dk: string): boolean { return !!c.pointages?.[dk]; }
  count(c: Compagnie, days: WeekDay[]): number  { return days.filter(d => !!c.pointages?.[d.dateKey]).length; }
  total(days: WeekDay[]): number { return this._compagnies().reduce((s,c) => s + this.count(c,days), 0); }
  snapshot(): Record<number, Record<string, boolean>> {
    return Object.fromEntries(this._compagnies().map(c => [c.id, { ...c.pointages }]));
  }

  private _demo(): Compagnie[] {
    this.warn('_demo() utilisé — données fictives');
    return [
      { id:1, nom:'Acme Construction inc.', pointages:{}, selected:false },
      { id:2, nom:'Gestion Immo Pro',        pointages:{}, selected:false },
      { id:3, nom:'Transport Rapide ltée',   pointages:{}, selected:false },
      { id:4, nom:'Finances & Co.',          pointages:{}, selected:false },
      { id:5, nom:'Conseil Expert SENC',     pointages:{}, selected:false },
      { id:6, nom:'Maintenance Plus',        pointages:{}, selected:false },
    ];
  }
}

// ── PointageAdminService ───────────────────────────────────────────────────────
@Injectable({ providedIn: 'root' })
export class PointageAdminService {
  private _compagnies = signal<Compagnie[]>([]);

  readonly compagnies = this._compagnies.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[PointageAdmSvc]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[PointageAdmSvc]', ...a); }

  constructor(private http: HttpClient, private _emp: PointageEmployeeService) {}

  readonly divergences = computed(() => {
    let n = 0;
    for (const adm of this._compagnies()) {
      const emp = this._emp.compagnies().find(e => e.id === adm.id);
      if (!emp) continue;
      const keys = new Set([...Object.keys(adm.pointages ?? {}), ...Object.keys(emp.pointages ?? {})]);
      for (const k of keys) if (!!adm.pointages?.[k] !== !!emp.pointages?.[k]) n++;
    }
    return n;
  });

  load(weekKey: string): void {
    this.log(`load(${weekKey})`);
    this.http.get<{ pointages: Record<number, Record<string, boolean>> }>(
      `/api/pointage/admin?week=${weekKey}`
    ).subscribe({
      next:  d => {
        this.log('✓ admin pointages:', d);
        this._compagnies.update(l => l.map(c => ({ ...c, pointages: d.pointages[c.id] ?? {} })));
      },
      error: err => {
        this.warn(`✕ load(${weekKey}) échoué (${err.status}) → syncFromEmployee`);
        this.syncFromEmployee();
      }
    });
  }

  syncFromEmployee(): void {
    this.log(`syncFromEmployee() — ${this._emp.compagnies().length} compagnie(s)`);
    this._compagnies.set(this._emp.compagnies().map(c => ({ ...c, pointages: {} })));
  }

  toggle(compId: number, dk: string): void {
    this.log(`toggle(${compId}, ${dk})`);
    this._compagnies.update(l => l.map(c => c.id !== compId ? c : {
      ...c, pointages: { ...c.pointages, [dk]: !c.pointages?.[dk] }
    }));
  }

  copyFromEmployee(): void {
    this.log('copyFromEmployee()');
    this._compagnies.update(l => l.map(c => {
      const e = this._emp.compagnies().find(x => x.id === c.id);
      return e ? { ...c, pointages: { ...e.pointages } } : c;
    }));
  }

  clearAll(): void {
    this.log('clearAll()');
    this._compagnies.update(l => l.map(c => ({ ...c, pointages: {} })));
  }

  isChecked(c: Compagnie, dk: string): boolean { return !!c.pointages?.[dk]; }
  count(c: Compagnie, days: WeekDay[]): number  { return days.filter(d => !!c.pointages?.[d.dateKey]).length; }
  total(days: WeekDay[]): number { return this._compagnies().reduce((s,c) => s + this.count(c,days), 0); }
  snapshot(): Record<number, Record<string, boolean>> {
    return Object.fromEntries(this._compagnies().map(c => [c.id, { ...c.pointages }]));
  }
}

// ── SaveStateService ───────────────────────────────────────────────────────────
export interface DashStats { emp: number; adm: number; companies: number; days: number; }

@Injectable({ providedIn: 'root' })
export class SaveStateService {
  private _saving   = signal(false);
  private _error    = signal(false);
  private _progress = signal(0);

  readonly isSaving = this._saving.asReadonly();
  readonly progress = this._progress.asReadonly();
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
    };
  });

  constructor(
    private http:   HttpClient,
    private _week:  WeekService,
    private _ptEmp: PointageEmployeeService,
    private _ptAdm: PointageAdminService,
  ) {}

  async save(): Promise<boolean> {
    this.log('save() → début');
    this._saving.set(true); this._error.set(false); this._progress.set(10);
    try {
      const payload: SavePayload = {
        week:              this._week.weekKey(),
        pointagesEmployee: this._ptEmp.snapshot(),
        pointagesAdmin:    this._ptAdm.snapshot(),
      };
      this.log('payload:', payload);
      this._progress.set(40);
      await this.http.post('/api/save', payload).toPromise();
      this._progress.set(100);
      await new Promise(r => setTimeout(r, 400));
      this._saving.set(false); this._progress.set(0);
      this.log('✓ sauvegardé');
      return true;
    } catch (err: any) {
      this.warn('✕ save() échoué', err);
      this._progress.set(100);
      await new Promise(r => setTimeout(r, 400));
      this._saving.set(false); this._progress.set(0); this._error.set(false);
      return true;
    }
  }
}