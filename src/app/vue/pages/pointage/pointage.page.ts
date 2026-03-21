import { Component, OnInit, signal, isDevMode, effect, Injector } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { EmployeeFormComponent }  from '../../components/employee-form/employee-form.component';
import { StatsBarComponent }      from '../../components/stats-bar/stats-bar.component';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { PointageTableComponent } from '../../components/pointage-table/pointage-table.component';
import { DatePickerComponent }    from '../../components/date-picker/date-picker.component';
import { WeekService, PointageEmployeeService, SaveStateService } from '../../../state/pointage/pointage.service';
import { PointageEmployeeDataService } from '../../../state/employees/Pointageemployeedata.service';
import { AuthService } from '../../../state/auth/auth.service';
import { Employee } from '../../../models';

@Component({
  selector: 'app-pointage-page',
  standalone: true,
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

    effect(() => {
      const emp  = this.empData.employee();
      const load = this.empData.loading();
      const err  = this.empData.error();
      if (load)      { this.log('empData: chargement en cours...'); }
      else if (err)  { this.warn('empData: erreur →', err); }
      else if (emp)  { this.log('empData: employé →', emp.employeeName, `(${emp.employeeId})`); }
      else           { this.warn('empData: aucun employé chargé'); }
    }, { injector: this.injector, allowSignalWrites: false });

    const week = this.weekSvc.weekKey();
    this.log(`semaine courante: ${week}`);
    this.ptEmpSvc.load(week);
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

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    this.log(`onWeekChange() → ${week}`);
    this.ptEmpSvc.load(week);
  }

  onEmployeeChange(patch: Partial<Employee>): void {
    this.log('onEmployeeChange():', patch);
    this.empData.patch(patch);
  }

  async save(): Promise<void> {
    this.log('save()');
    this.empData.save();
    const ok = await this.saveSvc.save();
    this.log(`save() → ${ok ? '✓' : '✕'}`);
    this.toast = ok ? '✓ Données sauvegardées' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }
}