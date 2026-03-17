import { Component, OnInit, signal, effect, Injector, Signal } from '@angular/core';
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
    CommonModule, FormsModule, RouterLink,
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
  selectedId    = signal<number | null>(null);
  searchQuery   = signal('');
  selectedMonth = '';

  showModal    = signal(false);
  editingEntry = signal<WorkDate | null>(null);
  modalForm    = signal<Partial<WorkDate>>({});

  isSaving!: Signal<boolean>;
  progress!: Signal<number>;
  saved = signal(false);
  toast = '';

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
    this.empSvc.loadList();
    effect(() => {
      this.employees.set(this.empSvc.list());
      this.loadingList.set(this.empSvc.loading());
    }, { injector: this.injector, allowSignalWrites: true });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.selectEmployee(+id);
    } else {
      effect(() => {
        const list = this.empSvc.list();
        if (list.length && !this.selectedId()) this.selectEmployee(list[0].id);
      }, { injector: this.injector, allowSignalWrites: true });
    }
  }

  selectEmployee(id: number): void {
    this.selectedId.set(id);
    this.loadingDetail.set(true);
    this.router.navigate(['/employees', id]);
    this.empSvc.getOne(id).subscribe({
      next: emp => { this.selected.set(emp); this.loadingDetail.set(false); },
      error: () => {
        const found = this.employees().find(e => e.id === id);
        if (found) this.selected.set(found);
        this.loadingDetail.set(false);
      }
    });
    this._loadPointage(id);
    this.ptEmpSvc.load(this.weekSvc.weekKey());
    setTimeout(() => { this.admSvc.syncFromEmployee(); this.admSvc.load(this.weekSvc.weekKey()); }, 60);
  }

  private _loadPointage(id: number = this.selectedId()!): void {
    this.empSvc.getWorkDates(id, this.selectedMonth).subscribe({
      next: d => this.workDates.set(d),
      error: () => this.workDates.set(this._demoWorkDates(id))
    });
    this.empSvc.getStats(id, this.selectedMonth).subscribe({
      next: s => this.stats.set(s),
      error: () => this.stats.set({ totalDays:22, presentDays:19, absentDays:2, lateDays:1, totalHours:152, averageHours:8 })
    });
  }

  reloadPointage(): void { this._loadPointage(); }

  onWeekChange(): void {
    if (this.selectedId()) this._loadPointage();
    this.ptEmpSvc.load(this.weekSvc.weekKey());
    setTimeout(() => { this.admSvc.syncFromEmployee(); this.admSvc.load(this.weekSvc.weekKey()); }, 60);
  }

  // ── Recherche ──────────────────────────────────────────
  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  get filteredEmployees(): Employee[] {
    const q = this.searchQuery().toLowerCase();
    return q
      ? this.employees().filter(e =>
          `${e.firstName} ${e.lastName} ${e.department}`.toLowerCase().includes(q))
      : this.employees();
  }

  // ── Helpers affichage ──────────────────────────────────
  initials(e: Employee): string {
    return `${e.firstName[0] ?? '?'}${e.lastName[0] ?? '?'}`.toUpperCase();
  }

  statusLabel(s: WorkDate['status']): string {
    return { present:'Présent', absent:'Absent', late:'Retard', 'half-day':'Mi-journée' }[s];
  }

  statusClass(s: string): string {
    return { present:'badge-success', absent:'badge-danger', late:'badge-warning', 'half-day':'badge-info' }[s] ?? '';
  }

  // ── Modal ──────────────────────────────────────────────
  openAddModal(): void {
    this.editingEntry.set(null);
    this.modalForm.set({
      date: new Date().toISOString().split('T')[0],
      checkIn: '08:00', checkOut: '17:00', status: 'present'
    });
    this.showModal.set(true);
  }

  openEditModal(w: WorkDate): void {
    this.editingEntry.set(w);
    this.modalForm.set({ ...w });
    this.showModal.set(true);
  }

  closeModal(): void { this.showModal.set(false); this.editingEntry.set(null); }

  // Handlers dédiés — aucune expression lambda dans le HTML
  onModalDate(event: Event):     void { this.modalForm.update(f => ({ ...f, date:     (event.target as HTMLInputElement).value })); }
  onModalCheckIn(event: Event):  void { this.modalForm.update(f => ({ ...f, checkIn:  (event.target as HTMLInputElement).value })); }
  onModalCheckOut(event: Event): void { this.modalForm.update(f => ({ ...f, checkOut: (event.target as HTMLInputElement).value })); }
  onModalStatus(event: Event):   void { this.modalForm.update(f => ({ ...f, status:   (event.target as HTMLSelectElement).value as WorkDate['status'] })); }
  onModalNote(event: Event):     void { this.modalForm.update(f => ({ ...f, note:     (event.target as HTMLInputElement).value })); }

  saveEntry(): void {
    const id = this.selectedId(); if (!id) return;
    const editing = this.editingEntry();
    const obs = editing
      ? this.empSvc.updateWorkDate(id, editing.id, this.modalForm())
      : this.empSvc.addWorkDate(id, this.modalForm() as any);
    obs.subscribe({
      next:  () => { this.closeModal(); this._loadPointage(); },
      error: () => { this.closeModal(); this._loadPointage(); }
    });
  }

  deleteEntry(wdId: number): void {
    const id = this.selectedId();
    if (!id || !confirm('Supprimer ce pointage ?')) return;
    this.empSvc.deleteWorkDate(id, wdId).subscribe({
      next:  () => this._loadPointage(),
      error: () => this._loadPointage()
    });
  }

  async save(): Promise<void> {
    const ok = await this.saveSvc.save();
    this.toast = ok ? '✓ Sauvegardé avec succès' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }

  private _demoWorkDates(empId: number): WorkDate[] {
    const base = new Date(); base.setDate(1);
    return Array.from({ length: 5 }, (_, i) => {
      const d = new Date(base); d.setDate(i * 4 + 2);
      return {
        id: i + 1, employeeId: empId,
        date: d.toISOString().split('T')[0],
        checkIn: '08:30', checkOut: '17:15', totalHours: 8.75,
        status: i === 2 ? 'late' : 'present',
        note: i === 2 ? 'Retard exceptionnel' : undefined
      } as WorkDate;
    });
  }
}