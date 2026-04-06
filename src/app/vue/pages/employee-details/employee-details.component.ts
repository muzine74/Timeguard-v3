import { Component, OnInit, signal, effect, Injector, Signal, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService }             from '../../../state/auth/auth.service';
import { EmployeesService }        from '../../../state/employees/employees.service';
import { WeekService }             from '../../../state/pointage/week.service';
import { PointageEmployeeService } from '../../../state/pointage/pointage-employee.service';
import { PointageAdminService }    from '../../../state/pointage/pointage-admin.service';
import { SaveStateService }        from '../../../state/pointage/save-state.service';
import { Employee } from '../../../models';
import { SectionHeaderComponent }  from '../../components/section-header/section-header.component';
import { StatsBarComponent }       from '../../components/stats-bar/stats-bar.component';
import { DatePickerComponent }     from '../../components/date-picker/date-picker.component';
import { PointageTableComponent }  from '../../components/pointage-table/pointage-table.component';
import { LoadingSpinnerComponent } from '../../components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-employee-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    SectionHeaderComponent, StatsBarComponent, DatePickerComponent,
    PointageTableComponent, LoadingSpinnerComponent,
  ],
  templateUrl: './employee-details.component.html',
  styleUrls: ['./employee-details.component.scss'],
})
export class EmployeeDetailsComponent implements OnInit {
  employees     = signal<Employee[]>([]);
  selected      = signal<Employee | null>(null);
  loadingList   = signal(true);
  loadingDetail = signal(false);
  selectedId    = signal<string | null>(null);
  searchQuery   = signal('');

  isSaving!: Signal<boolean>;
  progress!: Signal<number>;
  isLocked!: Signal<boolean>;
  lockedAt!: Signal<string | null>;
  validating   = signal(false);
  hasSaved     = signal(false);
  saved        = signal(false);
  toast        = '';
  allValidated = signal<Map<string, boolean>>(new Map());
  weekHistory  = signal<{ weekStart: string; isLocked: boolean }[]>([]);

  private _lastWeek  = '';
  private _lastEmpId = '';

  private get _dev(): boolean { return isDevMode(); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeDetails]', ...a); }

  constructor(
    public  auth:     AuthService,
    private empSvc:   EmployeesService,
    private route:    ActivatedRoute,
    private router:   Router,
    private injector: Injector,
    public  ptEmpSvc: PointageEmployeeService,
    public  admSvc:   PointageAdminService,
    public  weekSvc:  WeekService,
    public  saveSvc:  SaveStateService,
  ) {
    this.isSaving = saveSvc.isSaving;
    this.progress = saveSvc.progress;
    this.isLocked = saveSvc.isLocked;
    this.lockedAt = saveSvc.lockedAt;
  }

  ngOnInit(): void {
    this.empSvc.loadList();

    effect(() => {
      const list    = this.empSvc.list();
      const loading = this.empSvc.loading();
      this.employees.set(list);
      this.loadingList.set(loading);
      if (list.length) this._loadWeekStatuses();
    }, { injector: this.injector, allowSignalWrites: true });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.selectEmployee(id);
    } else {
      effect(() => {
        const list = this.empSvc.list();
        if (list.length && !this.selectedId()) this.selectEmployee(list[0].employeeId);
      }, { injector: this.injector, allowSignalWrites: true });
    }
  }

  selectEmployee(id: string): void {
    if (id === this._lastEmpId) return;
    this._lastEmpId = id;
    this.selectedId.set(id);
    this.hasSaved.set(false);
    this.loadingDetail.set(true);
    this.router.navigate(['/employees', id]);

    this.empSvc.getOne(id).subscribe({
      next: emp => {
        this.selected.set(emp);
        this.loadingDetail.set(false);
        this._loadWeekHistory(id);
      },
      error: err => {
        this.warn(`✕ getOne(${id}) — status: ${err.status}`);
        const found = this.employees().find(e => e.employeeId === id);
        if (found) this.selected.set(found);
        this.loadingDetail.set(false);
      }
    });

    const week = this.weekSvc.weekKey();
    this._lastWeek = week;
    this.ptEmpSvc.clearCache();
    this.saveSvc.loadStatus(id, week);
    this.ptEmpSvc.load(week, id, () => this.admSvc.load(week, id));
  }

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    const id   = this.selectedId();
    const weekChanged = week !== this._lastWeek;

    if (weekChanged) {
      this._lastWeek = week;
      this.hasSaved.set(false);
      if (id) this.saveSvc.loadStatus(id, week);
      this._loadWeekStatuses();
      this.ptEmpSvc.load(week, id ?? undefined, () => this.admSvc.load(week, id ?? undefined));
    }
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  get filteredEmployees(): Employee[] {
    const q      = this.searchQuery().toLowerCase();
    const status = this.allValidated();
    const list   = q
      ? this.employees().filter(e => e.employeeName.toLowerCase().includes(q))
      : this.employees();
    return [...list].sort((a, b) => {
      const aOk = status.get(a.employeeId.toLowerCase()) ?? false;
      const bOk = status.get(b.employeeId.toLowerCase()) ?? false;
      if (aOk !== bOk) return aOk ? 1 : -1;
      return a.employeeName.localeCompare(b.employeeName);
    });
  }

  isAllValidated$(empId: string): boolean {
    return this.allValidated().get(empId.toLowerCase()) ?? false;
  }

  goToWeek(weekStart: string): void {
    this.weekSvc.setDate(new Date(weekStart + 'T00:00:00'));
    this.onWeekChange();
  }

  initials(e: Employee): string {
    const parts = (e.employeeName ?? '').trim().split(' ');
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  async save(): Promise<void> {
    const empId = this.selectedId();
    if (empId) this.ptEmpSvc.setEmployeeId(empId);
    const ok = await this.saveSvc.save();
    if (ok) this.hasSaved.set(true);
    this.toast = ok ? '✓ Sauvegardé avec succès' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }

  unvalidateWeek(): void {
    const empId = this.selectedId();
    const week  = this.weekSvc.weekKey();
    if (!empId) return;

    this.validating.set(true);
    this.saveSvc.unvalidateWeek(empId, week).subscribe({
      next: () => {
        this.saveSvc.loadStatus(empId, week);
        this._loadWeekStatuses();
        this._loadWeekHistory(empId);
        this.hasSaved.set(false);
        this.ptEmpSvc.clearCache();
        this.ptEmpSvc.load(week, empId, () => this.admSvc.load(week, empId));
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
    const empId   = this.selectedId();
    const week    = this.weekSvc.weekKey();
    const adminId = this.auth.employeeId() ?? '';
    if (!empId || !adminId) return;

    this.validating.set(true);
    this.saveSvc.validateWeek(empId, week, adminId).subscribe({
      next: () => {
        this.saveSvc.loadStatus(empId, week);
        this._loadWeekStatuses();
        this._loadWeekHistory(empId);
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

  private _loadWeekStatuses(): void {
    this.saveSvc.getAllValidatedStatuses().subscribe({
      next: items => {
        const map = new Map<string, boolean>();
        items.forEach(i => map.set(i.employeeId.toLowerCase(), i.allValidated));
        this.allValidated.set(map);
      },
      error: () => {},
    });
  }

  private _loadWeekHistory(empId: string): void {
    this.saveSvc.getEmployeeWeekHistory(empId).subscribe({
      next: list => this.weekHistory.set(list),
      error: ()  => this.weekHistory.set([]),
    });
  }
}
