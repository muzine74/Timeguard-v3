import { Component, OnInit, signal, effect, Injector, Signal, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService }          from '../../../state/auth/auth.service';
import { EmployeesService }     from '../../../state/employees/employees.service';
import { WeekService, PointageEmployeeService, PointageAdminService, SaveStateService } from '../../../state/pointage/pointage.service';
import { Employee, WorkDate, WorkStats } from '../../../models';
import { SectionHeaderComponent }  from '../../components/section-header/section-header.component';
import { StatsBarComponent }       from '../../components/stats-bar/stats-bar.component';
import { DatePickerComponent }     from '../../components/date-picker/date-picker.component';
import { PointageTableComponent }  from '../../components/pointage-table/pointage-table.component';
import { LoadingSpinnerComponent } from '../../components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-employee-details',
  standalone: true,
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
  workDates     = signal<WorkDate[]>([]);
  stats         = signal<WorkStats | null>(null);
  loadingList   = signal(true);
  loadingDetail = signal(false);
  selectedId    = signal<string | null>(null);
  searchQuery   = signal('');
  selectedMonth = '';

  showModal    = signal(false);
  editingEntry = signal<WorkDate | null>(null);
  modalForm    = signal<Partial<WorkDate>>({});

  isSaving!: Signal<boolean>;
  progress!: Signal<number>;
  saved = signal(false);
  toast = '';

  private _lastWeek     = '';
  private _lastEmpId    = '';

  private get _dev(): boolean { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[EmployeeDetails]', ...a); }
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
  }

  ngOnInit(): void {
    this.log('ngOnInit()');
    this.empSvc.loadList();

    effect(() => {
      const list    = this.empSvc.list();
      const loading = this.empSvc.loading();
      this.employees.set(list);
      this.loadingList.set(loading);
      this.log(`liste employés: ${list.length} entrée(s), loading=${loading}`);
      if (list.length) this.log('  IDs:', list.map(e => e.employeeId));
    }, { injector: this.injector, allowSignalWrites: true });

    const id = this.route.snapshot.paramMap.get('id');
    this.log(`id depuis route: ${id ?? 'aucun'}`);

    if (id) {
      this.selectEmployee(id);
    } else {
      effect(() => {
        const list = this.empSvc.list();
        if (list.length && !this.selectedId()) {
          this.log(`auto-sélection premier employé: ${list[0].employeeId}`);
          this.selectEmployee(list[0].employeeId);
        }
      }, { injector: this.injector, allowSignalWrites: true });
    }
  }

  selectEmployee(id: string): void {
    const prev = this._lastEmpId;
    this.log(`selectEmployee(${id}) — précédent: ${prev || 'aucun'}`);

    if (id === this._lastEmpId) {
      this.log('  → même employé, pas de rechargement');
      return;
    }

    this._lastEmpId = id;
    this.selectedId.set(id);
    this.loadingDetail.set(true);
    this.router.navigate(['/employees', id]);

    this.empSvc.getOne(id).subscribe({
      next: emp => {
        this.selected.set(emp);
        this.loadingDetail.set(false);
        this.log(`✓ employé chargé: ${emp.employeeName} (${emp.employeeId})`);
        this.log('  objet complet:', emp);
      },
      error: err => {
        this.warn(`✕ getOne(${id}) échoué — status: ${err.status}`, err.error);
        const found = this.employees().find(e => e.employeeId === id);
        if (found) {
          this.warn(`  → fallback local: ${found.employeeName}`);
          this.selected.set(found);
        }
        this.loadingDetail.set(false);
      }
    });

    this._loadPointage(id);

    const week = this.weekSvc.weekKey();
    this._lastWeek = week;
    this.log(`pointage → semaine: ${week}, employé: ${id}`);
    this.log(`  cache vidé (changement d'employé)`);
    this.ptEmpSvc.clearCache();
    this.ptEmpSvc.load(week, id, () => {
      this.log('onLoaded → admSvc.load()');
      this.admSvc.load(week, id);
    });
    this.log(`  compagnies après load: ${this.ptEmpSvc.compagnies().length}`);
  }

  private _loadPointage(id: string = this.selectedId()!): void {
    this.log(`_loadPointage(empId=${id}, month="${this.selectedMonth || 'tous'}")`);

    this.empSvc.getWorkDates(id, this.selectedMonth).subscribe({
      next: d => {
        this.workDates.set(d);
        this.log(`✓ workDates: ${d.length} entrée(s)`, d);
      },
      error: err => {
        this.warn(`✕ getWorkDates échoué — status: ${err.status}`);
        const demo = this._demoWorkDates(id);
        this.warn(`  → fallback démo: ${demo.length} entrées`);
        this.workDates.set(demo);
      }
    });

    this.empSvc.getStats(id, this.selectedMonth).subscribe({
      next: s  => { this.stats.set(s); this.log(`✓ stats:`, s); },
      error: err => {
        this.warn(`✕ getStats échoué — status: ${err.status}`);
        const demo = { totalDays:22, presentDays:19, absentDays:2, lateDays:1, totalHours:152, averageHours:8 };
        this.stats.set(demo);
      }
    });
  }

  reloadPointage(): void {
    this.log(`reloadPointage() — mois: "${this.selectedMonth || 'tous'}"`);
    this._loadPointage();
  }

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    const id   = this.selectedId();

    this.log(`onWeekChange() — semaine: ${this._lastWeek || '(init)'} → ${week}, employé: ${id}`);

    const weekChanged = week !== this._lastWeek;
    this.log(`  changement de semaine: ${weekChanged}`);

    if (id) this._loadPointage();

    if (weekChanged) {
      this._lastWeek = week;
      this.log(`  → reload timelogs pour semaine ${week}`);
      this.ptEmpSvc.load(week, id ?? undefined, () => {
      this.admSvc.load(week, id ?? undefined);
    });
    } else {
      this.log(`  → même semaine, pas de reload timelogs`);
    }
  }

  onSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    this.log(`recherche: "${q}" → ${this.filteredEmployees.length} résultat(s)`);
  }

  get filteredEmployees(): Employee[] {
    const q = this.searchQuery().toLowerCase();
    return q
      ? this.employees().filter(e => e.employeeName.toLowerCase().includes(q))
      : this.employees();
  }

  initials(e: Employee): string {
    const parts = e.employeeName.trim().split(' ');
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  statusLabel(s: WorkDate['status']): string {
    return { present:'Présent', absent:'Absent', late:'Retard', 'half-day':'Mi-journée' }[s];
  }

  statusClass(s: string): string {
    return { present:'badge-success', absent:'badge-danger', late:'badge-warning', 'half-day':'badge-info' }[s] ?? '';
  }

  openAddModal(): void {
    this.log('openAddModal()');
    this.editingEntry.set(null);
    this.modalForm.set({ date: new Date().toISOString().split('T')[0], checkIn:'08:00', checkOut:'17:00', status:'present' });
    this.showModal.set(true);
  }

  openEditModal(w: WorkDate): void {
    this.log('openEditModal():', w);
    this.editingEntry.set(w);
    this.modalForm.set({ ...w });
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.editingEntry.set(null); }

  onModalDate(e: Event):     void { this.modalForm.update(f => ({ ...f, date:     (e.target as HTMLInputElement).value })); }
  onModalCheckIn(e: Event):  void { this.modalForm.update(f => ({ ...f, checkIn:  (e.target as HTMLInputElement).value })); }
  onModalCheckOut(e: Event): void { this.modalForm.update(f => ({ ...f, checkOut: (e.target as HTMLInputElement).value })); }
  onModalStatus(e: Event):   void { this.modalForm.update(f => ({ ...f, status:   (e.target as HTMLSelectElement).value as WorkDate['status'] })); }
  onModalNote(e: Event):     void { this.modalForm.update(f => ({ ...f, note:     (e.target as HTMLInputElement).value })); }

  saveEntry(): void {
    const id = this.selectedId(); if (!id) return;
    const editing = this.editingEntry();
    this.log(`saveEntry() — mode: ${editing ? 'update id='+editing.id : 'create'}`, this.modalForm());

    const obs = editing
      ? this.empSvc.updateWorkDate(id, editing.id, this.modalForm())
      : this.empSvc.addWorkDate(id, this.modalForm() as any);

    obs.subscribe({
      next: d  => { this.log('✓ saveEntry():', d); this.closeModal(); this._loadPointage(); },
      error: err => { this.warn(`✕ saveEntry() — status: ${err.status}`, err.error); this.closeModal(); this._loadPointage(); }
    });
  }

  deleteEntry(wdId: number): void {
    const id = this.selectedId();
    if (!id || !confirm('Supprimer ce pointage ?')) return;
    this.log(`deleteEntry(wdId=${wdId})`);
    this.empSvc.deleteWorkDate(id, wdId).subscribe({
      next:  () => { this.log(`✓ deleted ${wdId}`); this._loadPointage(); },
      error: err => { this.warn(`✕ deleteEntry — status: ${err.status}`); this._loadPointage(); }
    });
  }

  async save(): Promise<void> {
    this.log('save()');
    const ok = await this.saveSvc.save();
    this.log(`save() → ${ok ? '✓' : '✕'}`);
    this.toast = ok ? '✓ Sauvegardé avec succès' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }

  private _demoWorkDates(empId: string): WorkDate[] {
    const base = new Date(); base.setDate(1);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base); d.setDate(i * 4 + 2);
      return {
        id: i + 1, employeeId: 0,
        date: d.toISOString().split('T')[0],
        checkIn: '08:30', checkOut: '17:15', totalHours: 8.75,
        status: i === 2 ? 'late' : 'present',
        note: i === 2 ? 'Retard exceptionnel' : undefined
      } as WorkDate;
    });
  }
}