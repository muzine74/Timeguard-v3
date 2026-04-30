import { Injectable, signal, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Compagnie, WeekDay, TimeLogQueryResultDto } from '../../models';

interface WeekCache {
  pointages: Record<string, Record<string, boolean>>;
  prices:    Record<string, Record<string, number>>;
}

@Injectable({ providedIn: 'root' })
export class PointageEmployeeService {
  private _compagnies  = signal<Compagnie[]>([]);
  private _loading     = signal(false);
  private _error       = signal<string | null>(null);
  private _cache       = new Map<string, WeekCache>();
  private _currentWeek = '';
  private _employeeId  = '';
  // companyId → nom-jour-FR → prix effectif (customPrice ?? defaultPrice)
  private _pricingMap  = new Map<string, Record<string, number>>();

  readonly compagnies = this._compagnies.asReadonly();
  readonly isLoading  = this._loading.asReadonly();
  readonly error      = this._error.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[PointageEmpSvc]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[PointageEmpSvc]', ...a); }

  constructor(private http: HttpClient) {}

  load(weekKey: string, employeeId?: string, onLoaded?: () => void): void {
    this.log(`load(weekKey=${weekKey}, employeeId=${employeeId ?? 'undefined'})`);

    if (this._currentWeek && this._currentWeek !== weekKey) {
      this._cache.set(this._currentWeek, this._snapshotFull());
      this.log(`cache sauvegardé → semaine ${this._currentWeek}`);
    }
    this._currentWeek = weekKey;
    if (employeeId) this._employeeId = employeeId;

    const cached = this._cache.get(weekKey);
    if (cached) {
      this.log(`cache hit → semaine ${weekKey}`);
      this._compagnies.update(l => l.map(c => ({
        ...c,
        pointages: cached.pointages[c.companyId] ?? {},
        prices:    cached.prices[c.companyId]    ?? {},
      })));
      onLoaded?.();
      return;
    }

    if (!employeeId) {
      this.warn('employeeId manquant — aucun pointage chargé');
      this._compagnies.set([]);
      onLoaded?.();
      return;
    }

    this._loading.set(true);
    this._error.set(null);
    const url = `/api/Employee/${employeeId}/${weekKey}`;
    this.log(`GET ${url}`);

    this.http.get<TimeLogQueryResultDto[]>(url).subscribe({
      next: logs => {
        this.log(`✓ ${logs.length} timelog(s)`);
        if (!logs || logs.length === 0) {
          this._compagnies.set([]);
          this._cache.set(weekKey, { pointages: {}, prices: {} });
          this._loading.set(false);
          onLoaded?.();
          return;
        }
        const compagnies = this._fromTimeLogs(logs);
        this._compagnies.set(compagnies);
        this._cache.set(weekKey, this._snapshotFull());
        this._loading.set(false);
        onLoaded?.();
      },
      error: err => {
        this.warn(`✕ GET ${url} échoué (${err.status})`);
        this._error.set(`Impossible de charger les pointages — HTTP ${err.status}`);
        this._compagnies.set([]);
        this._loading.set(false);
        onLoaded?.();
      }
    });
  }

  private _fromTimeLogs(logs: TimeLogQueryResultDto[]): Compagnie[] {
    const map = new Map<string, { id: number; companyId: string; nom: string; pointages: Record<string, boolean>; prices: Record<string, number> }>();
    let idCounter = 1;
    for (const log of logs) {
      if (!map.has(log.companyId)) {
        map.set(log.companyId, { id: idCounter++, companyId: log.companyId, nom: log.companyName, pointages: {}, prices: {} });
      }
      const comp = map.get(log.companyId)!;
      if (log.workDate && log.workDate !== '0001-01-01') {
        comp.pointages[log.workDate] = true;
        if (log.clientPrice > 0) comp.prices[log.workDate] = log.clientPrice;
      }
    }
    return Array.from(map.values()).map(c => ({ ...c, selected: false }));
  }

  toggle(compId: number, dateKey: string): void {
    this._compagnies.update(l => l.map(c => {
      if (c.id !== compId) return c;
      const isNowChecked = !c.pointages?.[dateKey];
      const newPrices = { ...c.prices };
      // Injecter le prix du calendrier si la case est cochée pour la première fois
      if (isNowChecked && !(dateKey in newPrices)) {
        const price = this._pricingMap.get(c.companyId)?.[this._toDayName(dateKey)];
        if (price !== undefined) newPrices[dateKey] = price;
      }
      return { ...c, pointages: { ...c.pointages, [dateKey]: isNowChecked }, prices: newPrices };
    }));
    if (this._currentWeek) this._cache.set(this._currentWeek, this._snapshotFull());
  }

  /** Charge le calendrier tarifaire de chaque compagnie pour enrichir les prix lors du cochage. */
  loadPricing(employeeId: string, companyIds: string[]): void {
    for (const companyId of companyIds) {
      this.http.get<{ day: string; defaultPrice: number; customPrice?: number }[]>(
        `/api/employee/${employeeId}/pricing/${companyId}`
      ).subscribe({
        next: entries => {
          const map: Record<string, number> = {};
          for (const e of entries) map[e.day] = e.customPrice ?? e.defaultPrice;
          this._pricingMap.set(companyId, map);
          this.log(`✓ pricing ${companyId} (${entries.length} jours)`);
        },
        error: err => this.warn(`✕ pricing ${companyId} — HTTP ${err.status}`),
      });
    }
  }

  private _toDayName(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][
      new Date(y, m - 1, d).getDay()
    ];
  }

  selectAll(days: WeekDay[]): void {
    this._compagnies.update(l => l.map(c => ({
      ...c, pointages: Object.fromEntries(days.map(d => [d.dateKey, true]))
    })));
    if (this._currentWeek) this._cache.set(this._currentWeek, this._snapshotFull());
  }

  clearAll(): void {
    this._compagnies.update(l => l.map(c => ({ ...c, pointages: {} })));
    if (this._currentWeek) this._cache.set(this._currentWeek, this._snapshotFull());
  }

  /** Initialise la liste des compagnies depuis l'employé (fallback si timelogs vides). */
  initFromEmployee(empCompanies: { compagnieId: string; compagnieName: string }[]): void {
    if (this._compagnies().length > 0) return; // déjà peuplé par les timelogs
    let id = 1;
    this._compagnies.set(empCompanies.map(c => ({
      id:        id++,
      companyId: c.compagnieId,
      nom:       c.compagnieName,
      pointages: {},
      prices:    {},
      selected:  false,
    })));
    this.log(`initFromEmployee() → ${empCompanies.length} compagnie(s)`);
  }

  clearCache(): void { this.log('clearCache()'); this._cache.clear(); }

  isChecked(c: Compagnie, dk: string): boolean { return !!c.pointages?.[dk]; }
  count(c: Compagnie, days: WeekDay[]): number  { return days.filter(d => !!c.pointages?.[d.dateKey]).length; }
  total(days: WeekDay[]): number { return this._compagnies().reduce((s, c) => s + this.count(c, days), 0); }
  weekTotal(days: WeekDay[]): number {
    return this._compagnies().reduce((s, c) =>
      s + days.reduce((ds, d) =>
        ds + (c.pointages?.[d.dateKey] ? (c.prices?.[d.dateKey] ?? 0) : 0), 0), 0);
  }

  /** Payload pour l'API (pointages uniquement). */
  snapshot(): Record<string, Record<string, boolean>> {
    return Object.fromEntries(this._compagnies().map(c => [c.companyId, { ...c.pointages }]));
  }

  /** Snapshot complet pour le cache interne (pointages + prix). */
  private _snapshotFull(): WeekCache {
    return {
      pointages: Object.fromEntries(this._compagnies().map(c => [c.companyId, { ...c.pointages }])),
      prices:    Object.fromEntries(this._compagnies().map(c => [c.companyId, { ...c.prices }])),
    };
  }

  getEmployeeId(): string { return this._employeeId; }
  setEmployeeId(id: string): void { this._employeeId = id; }
}
