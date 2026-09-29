import { Component, OnInit, signal, effect, Injector, Signal, isDevMode, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
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
import { NoteInlineComponent } from '../../components/note-inline/note-inline.component';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { NoteAlertRefs } from '../../../state/notes/notes.service';
import { EmployeeListPanelComponent }   from './employee-list-panel/employee-list-panel.component';
import { EmployeeProfileCardComponent } from './employee-profile-card/employee-profile-card.component';
import { WeekHistoryPanelComponent, WeekHistoryItem } from './week-history-panel/week-history-panel.component';

/**
 * Page Employés (conteneur) : chargement des données, employé sélectionné, semaine affichée
 * et actions du pointage (sauvegarder / valider / annuler). L'affichage de la liste, de la
 * carte de profil et de l'historique est délégué aux sous-composants.
 */
@Component({
  selector: 'app-employee-details',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    SectionHeaderComponent, StatsBarComponent, DatePickerComponent,
    PointageTableComponent, LoadingSpinnerComponent, NoteInlineComponent,
    EmployeeListPanelComponent, EmployeeProfileCardComponent, WeekHistoryPanelComponent,
  ],
  templateUrl: './employee-details.component.html',
  styleUrls: ['./employee-details.component.scss'],
})
export class EmployeeDetailsComponent implements OnInit {
  // ── Données ─────────────────────────────────────────────────────────────
  readonly employees   = this.empSvc.list;
  readonly loadingList = this.empSvc.loading;
  selected      = signal<Employee | null>(null);
  selectedId    = signal<string | null>(null);
  loadingDetail = signal(false);
  /** Erreur de chargement de l'employé sélectionné (affichée à la place de la fiche). */
  detailError   = signal('');
  /** employeeId (minuscules) → toutes ses semaines sont validées. */
  allValidated  = signal<Map<string, boolean>>(new Map());
  weekHistory   = signal<WeekHistoryItem[]>([]);
  /** Notes actives de l'employé sélectionné et de ses compagnies. */
  noteRefs      = signal<NoteAlertRefs | null>(null);

  // ── État du pointage ────────────────────────────────────────────────────
  readonly isSaving: Signal<boolean>        = this.saveSvc.isSaving;
  readonly progress: Signal<number>         = this.saveSvc.progress;
  readonly isLocked: Signal<boolean>        = this.saveSvc.isLocked;
  readonly lockedAt: Signal<string | null>  = this.saveSvc.lockedAt;
  validating = signal(false);

  // ── Message temporaire ──────────────────────────────────────────────────
  saved      = signal(false);
  toast      = '';
  toastError = signal(false);
  private _toastTimer?: ReturnType<typeof setTimeout>;

  private _lastWeek  = '';
  private _lastEmpId = '';
  private destroyRef = inject(DestroyRef);
  private readonly noteAlerts = inject(NoteAlertService);

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
  ) {}

  ngOnInit(): void {
    this.empSvc.loadList(true);
    this._loadWeekStatuses();

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.selectEmployee(id);
    } else {
      // Sans employé dans l'URL : ouvre le premier de la liste dès qu'elle est chargée
      effect(() => {
        const list = this.empSvc.list();
        if (list.length && !this.selectedId()) this.selectEmployee(list[0].employeeId);
      }, { injector: this.injector, allowSignalWrites: true });
    }
  }

  // ── Sélection / semaine ─────────────────────────────────────────────────

  selectEmployee(id: string): void {
    if (id === this._lastEmpId) return;
    this._lastEmpId = id;
    this.selectedId.set(id);
    this.noteRefs.set({ employeeIds: [id] });
    this.detailError.set('');
    this.loadingDetail.set(true);
    this.router.navigate(['/employees', id]);

    this.empSvc.getOne(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: emp => {
        this.selected.set(emp);
        this.loadingDetail.set(false);
        this._loadWeekHistory(id);
      },
      error: err => {
        this.warn(`✕ getOne(${id}) — status: ${err.status}`);
        const found = this.employees().find(e => e.employeeId === id);
        if (found) this.selected.set(found);
        else { this.selected.set(null); this.detailError.set(`Impossible de charger cet employé (erreur ${err.status || 'réseau'}). Réessayez ou choisissez un autre employé.`); }
        this.loadingDetail.set(false);
      }
    });

    const week = this.weekSvc.weekKey();
    this._lastWeek = week;
    this.ptEmpSvc.clearCache();
    this._loadWeekData(id, week);
    this.ptEmpSvc.load(week, id, () => this.admSvc.load(week, id));
  }

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    const id   = this.selectedId();
    if (week === this._lastWeek) return;

    this._lastWeek = week;
    if (id) this._loadWeekData(id, week);
    this._loadWeekStatuses();
    this.ptEmpSvc.load(week, id ?? undefined, () => this.admSvc.load(week, id ?? undefined));
  }

  goToWeek(weekStart: string): void {
    this.weekSvc.setDate(new Date(weekStart + 'T00:00:00'));
    this.onWeekChange();
  }

  // ── Actions du pointage ─────────────────────────────────────────────────

  /** Validation possible : rien en cours et aucune modification non sauvegardée. */
  get canValidateNow(): boolean {
    return !this.validating() && !this.isSaving() && !this.ptEmpSvc.isDirty();
  }

  async save(): Promise<void> {
    const empId = this.selectedId();
    if (empId) this.ptEmpSvc.setEmployeeId(empId);
    const ok = await this.saveSvc.save();
    this.showToast(ok ? '✓ Sauvegardé avec succès' : '✕ Erreur lors de la sauvegarde', !ok);
  }

  validateWeek(): void {
    const empId   = this.selectedId();
    const week    = this.weekSvc.weekKey();
    const adminId = this.auth.employeeId() ?? '';
    if (!empId || !adminId) return;

    this.validating.set(true);
    this.noteAlerts.check({ employeeIds: [empId] }, `Validation du pointage — ${this.selected()?.employeeName ?? ''}`);
    this.saveSvc.validateWeek(empId, week, adminId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this._refreshAfterValidationChange(empId, week);
        this.showToast('✓ Semaine validée — pointage verrouillé.', false, 4000);
        this.validating.set(false);
      },
      error: (err: any) => {
        this.showToast(err?.error?.message ?? '✕ Erreur lors de la validation.', true, 4000);
        this.validating.set(false);
      },
    });
  }

  unvalidateWeek(): void {
    const empId = this.selectedId();
    const week  = this.weekSvc.weekKey();
    if (!empId) return;

    this.validating.set(true);
    this.saveSvc.unvalidateWeek(empId, week).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this._refreshAfterValidationChange(empId, week);
        // Semaine rouverte : recharge ses pointages (la version en cache était verrouillée)
        this.ptEmpSvc.clearCache();
        this.ptEmpSvc.load(week, empId, () => this.admSvc.load(week, empId));
        this.showToast('🔓 Validation annulée.', false, 4000);
        this.validating.set(false);
      },
      error: (err: any) => {
        this.showToast(err?.error?.message ?? '✕ Erreur lors de l\'annulation.', true, 4000);
        this.validating.set(false);
      },
    });
  }

  // ── Chargements ─────────────────────────────────────────────────────────

  /** Statut, gains de la semaine et gains cumulés de l'employé. */
  private _loadWeekData(empId: string, week: string): void {
    this.saveSvc.loadStatus(empId, week);
    this.saveSvc.loadEarnings(empId, week);
    this.saveSvc.loadCumulativeEarnings(empId);
  }

  /** Après validation / annulation : statut de la semaine, pastilles de la liste, historique. */
  private _refreshAfterValidationChange(empId: string, week: string): void {
    this.saveSvc.loadStatus(empId, week);
    this.saveSvc.loadEarnings(empId, week);
    this._loadWeekStatuses();
    this._loadWeekHistory(empId);
  }

  private _loadWeekStatuses(): void {
    this.saveSvc.getAllValidatedStatuses().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: items => {
        const map = new Map<string, boolean>();
        items.forEach(i => map.set(i.employeeId.toLowerCase(), i.allValidated));
        this.allValidated.set(map);
      },
      error: () => {},
    });
  }

  private _loadWeekHistory(empId: string): void {
    this.saveSvc.getEmployeeWeekHistory(empId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => this.weekHistory.set(list),
      error: ()  => this.weekHistory.set([]),
    });
  }

  /** Message temporaire en bas à droite (succès ou erreur). */
  private showToast(message: string, isError = false, ms = 3000): void {
    this.toast = message;
    this.toastError.set(isError);
    this.saved.set(true);
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.saved.set(false), ms);
  }
}
