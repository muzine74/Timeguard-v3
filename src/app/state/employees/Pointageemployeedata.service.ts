import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, tap } from 'rxjs';
import { Employee } from '../../models';

// Shape exacte retournée par l'API .NET
// Accepte PascalCase (.NET défaut) ET camelCase (.NET avec JsonNamingPolicy.CamelCase)
interface EmployeePoco {
  employeeId?:           string; EmployeeId?:           string;
  nas?:                  string; NAS?:                  string;
  employeeName?:         string; EmployeeName?:         string;
  employeeMail?:         string; EmployeeMail?:         string;
  employeePhone?:        string; EmployeePhone?:        string;
  employeeNote?:         string; EmployeeNote?:         string;
  addressId?:            string; AddressId?:            string;
  employeeCivicNumber?:  string; EmployeeCivicNumber?:  string;
  employeeSuite?:        string; EmployeeSuite?:        string;
  employeeZipCode?:      string; EmployeeZipCode?:      string;
  employeeCity?:         string; EmployeeCity?:         string;
  employeeState?:        string; EmployeeState?:        string;
  employeeCountry?:      string; EmployeeCountry?:      string;
  employeeAdressNote?:   string; EmployeeAdressNote?:   string;
  employeeCompagnies?:   { compagnieId?: string; CompagnieId?: string; compagnieName?: string; CompagnieName?: string }[];
  EmployeeCompagnies?:   { compagnieId?: string; CompagnieId?: string; compagnieName?: string; CompagnieName?: string }[];
}

@Injectable({ providedIn: 'root' })
export class PointageEmployeeDataService {

  // ── Signals publics ───────────────────────────────────
  private _employee = signal<Employee | null>(null);
  private _loading  = signal(false);
  private _error    = signal<string | null>(null);

  readonly employee  = this._employee.asReadonly();
  readonly loading   = this._loading.asReadonly();
  readonly error     = this._error.asReadonly();
  readonly hasError  = computed(() => this._error() !== null);
  readonly hasData   = computed(() => this._employee() !== null);

  // ── Débogage ─────────────────────────────────────────
  private get _dev(): boolean { return isDevMode(); }
  private log(...a: unknown[]):  void { if (this._dev) console.log('[PointageEmployeeDataService]', ...a); }
  private warn(...a: unknown[]): void { if (this._dev) console.warn('[PointageEmployeeDataService]', ...a); }

  constructor(private http: HttpClient) {}

  // ── Mapper EmployeePoco → Employee ───────────────────
  private _map(p: EmployeePoco): Employee {
    const raw = p as any;
    const compagnies = (raw['employeeCompagnies'] ?? [])
      .map((c: any) => ({
        compagnieId:   c['compagnieId']   ?? '',
        compagnieName: c['compagnieName'] ?? '',
      }));

    const emp: Employee = {
      employeeId:          raw['employeeId']          ?? '',
      employeeName:        raw['employeeName']        ?? '',
      employeeMail:        raw['employeeMail']        ?? '',
      employeePhone:       raw['employeePhone']       ?? '',
      employeeNote:        raw['employeeNote']        ?? '',
      nas:                 raw['nas']                 ?? '',
      employeeCivicNumber: raw['employeeCivicNumber'] ?? '',
      employeeSuite:       raw['employeeSuite']       ?? '',
      employeeZipCode:     raw['employeeZipCode']     ?? '',
      employeeCity:        raw['employeeCity']        ?? '',
      employeeState:       raw['employeeState']       ?? '',
      employeeCountry:     raw['employeeCountry']     ?? '',
      employeeAdressNote:  raw['employeeAdressNote']  ?? '',
      employeeCompagnies:  compagnies,
    };
    this.log('_map() →', emp);
    return emp;
  }

  // ── Chargement par ID ─────────────────────────────────
  loadById(id: string): void {
    if (!id) {
      this.warn('loadById() appelé sans ID — abandon');
      return;
    }

    this.log(`loadById(${id}) → GET /api/employee/${id}`);
    this._loading.set(true);
    this._error.set(null);

    this.http.get<EmployeePoco>(`/api/employee/${id}`).pipe(
      tap(raw => {
        this.log('─── réponse brute API ───────────────────');
        this.log('type:', typeof raw);
        this.log('valeur complète:', JSON.stringify(raw, null, 2));
        this.log('clés reçues:', Object.keys(raw ?? {}));
        this.log('─── champs attendus ─────────────────────');
        const champs: (keyof EmployeePoco)[] = [
          'employeeId','nas','employeeName','employeeMail',
          'employeePhone','employeeNote','employeeCivicNumber',
          'employeeSuite','employeeZipCode','employeeCity',
          'employeeState','employeeCountry','employeeAdressNote',
          'employeeCompagnies'
        ];
        for (const key of champs) {
          const val = (raw as any)[key];
          const status = val === undefined ? '❌ MANQUANT'
                       : val === null      ? '⚠ NULL'
                       : val === ''        ? '⚠ VIDE'
                       : '✓';
          this.log(`  ${status.padEnd(12)} ${key}: ${JSON.stringify(val)}`);
        }
        this.log('─────────────────────────────────────────');
      }),
      map(p => this._map(p)),
    ).subscribe({
      next: emp => {
        this._employee.set(emp);
        this._loading.set(false);
        this.log(`✓ employé chargé: ${emp.employeeName} (${emp.employeeId})`);
        this.log('objet Employee mappé:', emp);
      },
      error: err => {
        this.warn(`✕ GET /api/employee/${id} échoué`);
        this.warn(`  status:  ${err.status}`);
        this.warn(`  message: ${err.message}`);
        this.warn(`  body:`, err.error);
        this._error.set(`HTTP ${err.status} — ${err.message}`);
        this._loading.set(false);

        const demo = this._demoById(id);
        if (demo) {
          this.warn('  → fallback sur donnée démo');
          this._employee.set(demo);
          this._error.set(null);
        }
      }
    });
  }

  // ── Mise à jour locale (patch sans appel API) ─────────
  patch(partial: Partial<Employee>): void {
    this.log('patch() appliqué:', partial);
    this._employee.update(e => e ? { ...e, ...partial } : e);
  }

  // ── Sauvegarde (PUT) ──────────────────────────────────
  save(): void {
    const emp = this._employee();
    if (!emp) { this.warn('save() — aucun employé chargé'); return; }

    this.log(`save() → PUT /api/employee/${emp.employeeId}`, emp);
    this._loading.set(true);

    this.http.put<EmployeePoco>(`/api/employee/${emp.employeeId}`, emp).pipe(
      tap(raw => this.log('save() réponse brute:', raw)),
      map(p   => this._map(p)),
    ).subscribe({
      next: updated => {
        this._employee.set(updated);
        this._loading.set(false);
        this.log(`✓ employé sauvegardé: ${updated.employeeName}`);
      },
      error: err => {
        this.warn(`✕ PUT /api/employee/${emp.employeeId} échoué`);
        this.warn(`  status: ${err.status} | message: ${err.message}`);
        this._error.set(`Sauvegarde échouée — HTTP ${err.status}`);
        this._loading.set(false);
      }
    });
  }

  // ── Reset ─────────────────────────────────────────────
  reset(): void {
    this.log('reset()');
    this._employee.set(null);
    this._error.set(null);
    this._loading.set(false);
  }

  // ── Démo fallback ─────────────────────────────────────
  private _demoById(id: string): Employee | null {
    const demos: Record<string, Employee> = {
      '00000000-0000-0000-0000-000000000001': {
        employeeId:          '00000000-0000-0000-0000-000000000001',
        employeeName:        'Sophie Martin',
        employeeMail:        'sophie@co.com',
        employeePhone:       '514-555-0001',
        employeeNote:        '',
        nas:                 '123 456 789',
        employeeCivicNumber: '123',
        employeeSuite:       '',
        employeeZipCode:     'H1A 1A1',
        employeeCity:        'Montréal',
        employeeState:       'QC',
        employeeCountry:     'Canada',
        employeeAdressNote:  '',
        employeeCompagnies:  [],
      },
    };
    return demos[id] ?? null;
  }
}