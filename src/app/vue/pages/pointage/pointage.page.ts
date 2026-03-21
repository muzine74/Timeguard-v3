import { Component, OnInit, signal, isDevMode, effect, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { EmployeeFormComponent }  from '../../components/employee-form/employee-form.component';
import { StatsBarComponent }      from '../../components/stats-bar/stats-bar.component';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { PointageTableComponent } from '../../components/pointage-table/pointage-table.component';
import { WeekService, PointageEmployeeService, PointageAdminService, SaveStateService } from '../../../state/pointage/pointage.service';
import { PointageEmployeeDataService } from '../../../state/employees/Pointageemployeedata.service';
import { AuthService } from '../../../state/auth/auth.service';
import { Employee } from '../../../models';

@Component({
  selector: 'app-pointage-page',
  standalone: true,
  imports: [CommonModule, EmployeeFormComponent, StatsBarComponent, SectionHeaderComponent, PointageTableComponent],
  templateUrl: './pointage.page.html',
})
export class PointagePage implements OnInit {
  saved    = signal(false);
  toast    = '';
  progress = this.saveSvc.progress;
  isSaving = this.saveSvc.isSaving;

  employee = this.empData.employee;
  loading  = this.empData.loading;
  error    = this.empData.error;

  isError(): boolean { return this.saveSvc.isError(); }

  private get _dev(): boolean { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[PointagePage]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[PointagePage]', ...a); }

  constructor(
    public  weekSvc:  WeekService,
    public  ptEmpSvc: PointageEmployeeService,
    public  admSvc:   PointageAdminService,
    public  saveSvc:  SaveStateService,
    public  empData:  PointageEmployeeDataService,
    private auth:     AuthService,
    private route:    ActivatedRoute,
    private injector: Injector,
  ) {}

  ngOnInit(): void {
    this.log('ngOnInit()');
    this.log('auth.user()      :', this.auth.user());
    this.log('auth.employeeId():', this.auth.employeeId());

    const id = this._resolveEmployeeId();
    this.log(`ID employé résolu: ${id}`);
    this.empData.loadById(id);

    // Surveiller les changements de l'état empData
    effect(() => {
      const emp   = this.empData.employee();
      const load  = this.empData.loading();
      const err   = this.empData.error();

      if (load) {
        this.log('empData: chargement en cours...');
      } else if (err) {
        this.warn('empData: erreur →', err);
      } else if (emp) {
        this.log('empData: employé disponible →', emp.employeeName, `(${emp.employeeId})`);
        this.log('empData: objet complet →', emp);
      } else {
        this.warn('empData: aucun employé chargé');
      }
    }, { injector: this.injector, allowSignalWrites: false });

    const week = this.weekSvc.weekKey();
    this.log(`semaine courante: ${week}`);
    this.ptEmpSvc.load(week);
    setTimeout(() => {
      this.admSvc.syncFromEmployee();
      this.admSvc.load(week);
      this.log(`compagnies emp: ${this.ptEmpSvc.compagnies().length}`);
      this.log(`compagnies adm: ${this.admSvc.compagnies().length}`);
    }, 50);
  }

  // ── Résolution ID employé ─────────────────────────────
  // Priorité : 1. query param  2. JWT  3. fallback démo
  private _resolveEmployeeId(): string {
    this.log('_resolveEmployeeId() — sources disponibles:');
    this.log('  query ?employeeId :', this.route.snapshot.queryParamMap.get('employeeId') ?? '(absent)');
    this.log('  JWT employeeId    :', this.auth.employeeId() ?? '(absent)');

    const fromQuery = this.route.snapshot.queryParamMap.get('employeeId');
    if (fromQuery) {
      this.log(`→ source: query param → ${fromQuery}`);
      return fromQuery;
    }

    const fromJwt = this.auth.employeeId();
    if (fromJwt) {
      this.log(`→ source: JWT → ${fromJwt}`);
      return fromJwt;
    }

    const fallback = '00000000-0000-0000-0000-000000000001';
    this.warn(`→ source: fallback démo → ${fallback}`);
    return fallback;
  }

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    this.log(`onWeekChange() → semaine: ${week}`);
    this.ptEmpSvc.load(week);
    setTimeout(() => {
      this.admSvc.syncFromEmployee();
      this.admSvc.load(week);
    }, 50);
  }

  onEmployeeChange(patch: Partial<Employee>): void {
    this.log('onEmployeeChange() patch:', patch);
    this.empData.patch(patch);
  }

  async save(): Promise<void> {
    this.log('save() → empData.save() + saveSvc.save()');
    this.log('  employé courant:', this.empData.employee());
    this.empData.save();
    const ok = await this.saveSvc.save();
    this.log(`save() résultat: ${ok ? '✓ succès' : '✕ échec'}`);
    this.toast = ok ? '✓ Données sauvegardées' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }
}