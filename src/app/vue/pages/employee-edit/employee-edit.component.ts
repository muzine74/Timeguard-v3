import { Component, OnInit, signal, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { EmployeesService } from '../../../state/employees/employees.service';
import { Employee, EmployeeForm } from '../../../models';

@Component({
  selector: 'app-employee-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-edit.component.html',
  styleUrls: ['./employee-edit.component.scss'],
})
export class EmployeeEditComponent implements OnInit {
  saved       = signal(false);
  error       = signal('');
  saving      = signal(false);
  loadingForm = signal(false);

  // Liste depuis le service
  empLoading = this.empSvc.loading;

  employeeId  = signal('');
  searchQuery = '';

  get filteredEmployees(): Employee[] {
    const q = this.searchQuery.toLowerCase();
    const list = this.empSvc.list();
    return q ? list.filter(e => e.employeeName.toLowerCase().includes(q)) : list;
  }

  form: EmployeeForm = this._emptyForm();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[EmployeeEdit]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeEdit]', ...a); }

  constructor(
    private empSvc: EmployeesService,
    private router: Router,
    private route:  ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.empSvc.loadList();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.selectEmployee(id);
  }

  selectEmployee(id: string): void {
    if (id === this.employeeId()) return;
    this.employeeId.set(id);
    this.error.set('');
    this.saved.set(false);
    this.loadingForm.set(true);
    this.log(`selectEmployee(${id})`);

    this.empSvc.getOne(id).subscribe({
      next: emp => {
        this.form = this._fromEmployee(emp);
        this.loadingForm.set(false);
        this.log('✓ formulaire rempli:', emp.employeeName);
      },
      error: err => {
        this.warn(`✕ getOne(${id}) échoué (${err.status})`);
        this.error.set(`Impossible de charger — HTTP ${err.status}`);
        this.loadingForm.set(false);
      },
    });
  }

  submit(): void {
    if (!this.employeeId()) { this.error.set('Aucun employé sélectionné.'); return; }
    if (!this.form.employeeName.trim()) { this.error.set('Le nom est requis.'); return; }

    this.error.set('');
    this.saving.set(true);
    this.log(`submit() → PUT /api/employee/${this.employeeId()}`);

    this.empSvc.updateFull(this.employeeId(), this.form).subscribe({
      next: () => {
        this.saved.set(true);
        this.saving.set(false);
        this.log('✓ mise à jour réussie');
        this.empSvc.loadList();
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: err => {
        this.warn('✕ update échoué:', err);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  cancel(): void { this.router.navigate(['/employees']); }

  private _fromEmployee(e: Employee): EmployeeForm {
    return {
      employeeName:        e.employeeName        ?? '',
      employeeMail:        e.employeeMail        ?? '',
      employeePhone:       e.employeePhone       ?? '',
      employeeNote:        e.employeeNote        ?? '',
      nas:                 e.nas                 ?? '',
      employeeCivicNumber: e.employeeCivicNumber ?? '',
      employeeSuite:       e.employeeSuite       ?? '',
      employeeZipCode:     e.employeeZipCode     ?? '',
      employeeCity:        e.employeeCity        ?? '',
      employeeState:       e.employeeState       ?? 'QC',
      employeeCountry:     e.employeeCountry     ?? 'Canada',
      employeeAdressNote:  e.employeeAdressNote  ?? '',
    };
  }

  private _emptyForm(): EmployeeForm {
    return {
      employeeName: '', employeeMail: '', employeePhone: '', employeeNote: '', nas: '',
      employeeCivicNumber: '', employeeSuite: '', employeeZipCode: '',
      employeeCity: '', employeeState: 'QC', employeeCountry: 'Canada', employeeAdressNote: '',
    };
  }
}
