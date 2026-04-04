import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Compagnie, WeekDay } from '../../models';
import { PointageEmployeeService } from './pointage-employee.service';

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

  load(weekKey: string, employeeId?: string, onLoaded?: () => void): void {
    this.log(`load(weekKey=${weekKey}, employeeId=${employeeId ?? 'undefined'})`);
    this.syncFromEmployee();

    if (!employeeId) {
      this.warn('employeeId manquant → pointages admin vides');
      onLoaded?.();
      return;
    }

    const url = `/api/pointage/${employeeId}/${weekKey}`;
    this.log(`GET ${url}`);

    // Bug #2 corrigé : indexer par companyId (Guid) et non c.id (compteur local)
    this.http.get<{ pointages: Record<string, Record<string, boolean>> }>(url).subscribe({
      next: d => {
        this.log('✓ admin pointages:', d);
        if (!d || !d.pointages) {
          this.warn('réponse admin vide → pointages admin vides');
          onLoaded?.();
          return;
        }
        this._compagnies.update(l => l.map(c => ({
          ...c, pointages: d.pointages[c.companyId] ?? {}
        })));
        onLoaded?.();
      },
      error: err => {
        this.warn(`✕ GET ${url} échoué (${err.status}) → pointages admin vides`);
        onLoaded?.();
      }
    });
  }

  syncFromEmployee(): void {
    const empComps = this._emp.compagnies();
    this.log(`syncFromEmployee() — ${empComps.length} compagnie(s)`);
    this._compagnies.set(empComps.map(c => ({ ...c, pointages: {} })));
  }

  toggle(compId: number, dk: string): void {
    this._compagnies.update(l => l.map(c => c.id !== compId ? c : {
      ...c, pointages: { ...c.pointages, [dk]: !c.pointages?.[dk] }
    }));
  }

  copyFromEmployee(): void {
    this._compagnies.update(l => l.map(c => {
      const e = this._emp.compagnies().find(x => x.id === c.id);
      return e ? { ...c, pointages: { ...e.pointages } } : c;
    }));
  }

  clearAll(): void {
    this._compagnies.update(l => l.map(c => ({ ...c, pointages: {} })));
  }

  isChecked(c: Compagnie, dk: string): boolean { return !!c.pointages?.[dk]; }
  count(c: Compagnie, days: WeekDay[]): number  { return days.filter(d => !!c.pointages?.[d.dateKey]).length; }
  total(days: WeekDay[]): number { return this._compagnies().reduce((s, c) => s + this.count(c, days), 0); }

  snapshot(): Record<string, Record<string, boolean>> {
    return Object.fromEntries(this._compagnies().map(c => [c.companyId, { ...c.pointages }]));
  }
}
