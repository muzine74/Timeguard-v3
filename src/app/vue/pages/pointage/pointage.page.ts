import { Component, OnInit, signal, isDevMode, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { EmployeeFormComponent }  from '../../components/employee-form/employee-form.component';
import { StatsBarComponent }      from '../../components/stats-bar/stats-bar.component';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { PointageTableComponent } from '../../components/pointage-table/pointage-table.component';
import { DatePickerComponent }    from '../../components/date-picker/date-picker.component';
import { WeekService }             from '../../../state/pointage/week.service';
import { PointageEmployeeService } from '../../../state/pointage/pointage-employee.service';
import { PointageAdminService }    from '../../../state/pointage/pointage-admin.service';
import { SaveStateService }        from '../../../state/pointage/save-state.service';
import { EmployeesService }        from '../../../state/employees/employees.service';
import { AuthService }             from '../../../state/auth/auth.service';
import { Employee, EmployeeForm }  from '../../../models';

@Component({
  selector: 'app-pointage-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    EmployeeFormComponent,
    StatsBarComponent,
    SectionHeaderComponent,
    PointageTableComponent,
    DatePickerComponent,
  ],
  templateUrl: './pointage.page.html',
})
export class PointagePage implements OnInit {
  // Angular #8 : DestroyRef pour takeUntilDestroyed
  private readonly destroyRef = inject(DestroyRef);

  hasSaved   = signal(false);
  saved      = signal(false);
  toast      = '';
  progress   = this.saveSvc.progress;
  isSaving   = this.saveSvc.isSaving;
  isLocked   = this.saveSvc.isLocked;
  lockedAt   = this.saveSvc.lockedAt;
  validating = signal(false);

  // Arch #5 : état employé local — PointageEmployeeDataService supprimé
  employee   = signal<Employee | null>(null);
  empLoading = signal(false);
  empError   = signal<string | null>(null);

  isError(): boolean { return this.saveSvc.isError(); }

  private get _dev(): boolean { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[PointagePage]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[PointagePage]', ...a); }

  constructor(
    public  weekSvc:  WeekService,
    public  ptEmpSvc: PointageEmployeeService,
    public  ptAdmSvc: PointageAdminService,
    public  saveSvc:  SaveStateService,
    private empSvc:   EmployeesService,
    public  auth:     AuthService,
    private route:    ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.log('ngOnInit()');

    const id = this._resolveEmployeeId();
    this.log(`ID employé résolu: ${id}`);

    // Angular #8 : takeUntilDestroyed sur la subscription de chargement
    this.empLoading.set(true);
    this.empSvc.getOne(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: emp => {
          this.employee.set(emp);
          this.empLoading.set(false);
          this.log(`✓ employé chargé: ${emp.employeeName}`);
          // Initialise les compagnies depuis l'employé — visible même si aucun timelog pour la semaine
          this.ptEmpSvc.initFromEmployee(emp.employeeCompagnies ?? []);
        },
        error: err => {
          this.warn(`✕ getOne(${id}) échoué — HTTP ${err.status}`);
          this.empError.set(`Impossible de charger l'employé — HTTP ${err.status}`);
          this.empLoading.set(false);
        },
      });

    const week = this.weekSvc.weekKey();
    this._lastWeek = week;
    this.ptEmpSvc.load(week, id, () => this.ptAdmSvc.load(week, id));
    this.saveSvc.loadStatus(id, week);
  }

  private _resolveEmployeeId(): string {
    const fromQuery = this.route.snapshot.queryParamMap.get('employeeId');
    if (fromQuery) { this.log(`→ query param: ${fromQuery}`); return fromQuery; }

    const fromJwt = this.auth.employeeId();
    if (fromJwt)  { this.log(`→ JWT: ${fromJwt}`); return fromJwt; }

    const fallback = '00000000-0000-0000-0000-000000000001';
    this.warn(`→ fallback démo: ${fallback}`);
    return fallback;
  }

  private _lastWeek = '';

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    const id   = this._resolveEmployeeId();

    if (week === this._lastWeek) return;

    this.log(`onWeekChange() → ${this._lastWeek} → ${week}`);
    this._lastWeek = week;
    this.hasSaved.set(false);
    this.ptEmpSvc.load(week, id, () => this.ptAdmSvc.load(week, id));
    this.saveSvc.loadStatus(id, week);
  }

  onEmployeeChange(patch: Partial<Employee>): void {
    this.employee.update(e => e ? { ...e, ...patch } : e);
  }

  async save(): Promise<void> {
    this.log('save()');
    const emp = this.employee();
    if (emp) {
      this.empSvc.updateFull(emp.employeeId, emp as unknown as EmployeeForm)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next:  () => this.log('✓ employé sauvegardé'),
          error: err => this.warn('✕ updateFull échoué:', err.status),
        });
    }
    const ok = await this.saveSvc.save();
    this.log(`save() → ${ok ? '✓' : '✕'}`);
    if (ok) this.hasSaved.set(true);
    this.toast = ok ? '✓ Données sauvegardées' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }

  unvalidateWeek(): void {
    const empId = this._resolveEmployeeId();
    const week  = this.weekSvc.weekKey();
    this.validating.set(true);

    this.saveSvc.unvalidateWeek(empId, week)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saveSvc.loadStatus(empId, week);
          this.hasSaved.set(false);
          this.ptEmpSvc.clearCache();
          this.ptEmpSvc.load(week, empId, () => this.ptAdmSvc.load(week, empId));
          this.toast = '🔓 Validation annulée.';
          this.saved.set(true);
          this.validating.set(false);
          setTimeout(() => this.saved.set(false), 4000);
        },
        error: (err: any) => {
          this.toast = err?.error?.message ?? '✕ Erreur lors de l\'annulation.';
          this.saved.set(true);
          this.validating.set(false);
          setTimeout(() => this.saved.set(false), 4000);
        },
      });
  }

  validateWeek(): void {
    const empId   = this._resolveEmployeeId();
    const week    = this.weekSvc.weekKey();
    const adminId = this.auth.employeeId() ?? '';
    this.validating.set(true);

    this.saveSvc.validateWeek(empId, week, adminId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saveSvc.loadStatus(empId, week);
          this.hasSaved.set(false);
          this.toast = '✓ Semaine validée — pointage verrouillé.';
          this.saved.set(true);
          this.validating.set(false);
          setTimeout(() => this.saved.set(false), 4000);
        },
        error: (err: any) => {
          this.toast = err?.error?.message ?? '✕ Erreur lors de la validation.';
          this.saved.set(true);
          this.validating.set(false);
          setTimeout(() => this.saved.set(false), 4000);
        },
      });
  }
}
