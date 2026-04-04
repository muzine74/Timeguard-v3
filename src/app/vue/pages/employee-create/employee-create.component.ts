import { Component, signal, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeesService } from '../../../state/employees/employees.service';
import { EmployeeForm } from '../../../models';

@Component({
  selector: 'app-employee-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-create.component.html',
  styleUrls: ['./employee-create.component.scss'],
})
export class EmployeeCreateComponent {
  saved  = signal(false);
  error  = signal('');
  saving = signal(false);

  form: EmployeeForm = this._emptyForm();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[EmployeeCreate]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeCreate]', ...a); }

  constructor(private empSvc: EmployeesService, private router: Router) {}

  submit(): void {
    if (!this.form.employeeName.trim()) {
      this.error.set('Le nom est requis.');
      return;
    }
    this.error.set('');
    this.saving.set(true);
    this.log('submit() → POST /api/employee');

    this.empSvc.create(this.form).subscribe({
      next: res => {
        this.log('✓ créé:', res);
        this.saved.set(true);
        this.saving.set(false);
        setTimeout(() => this.router.navigate(['/employees/edit']), 1500);
      },
      error: err => {
        this.warn('✕ create échoué:', err);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  cancel(): void { this.router.navigate(['/employees']); }

  private _emptyForm(): EmployeeForm {
    return {
      employeeName: '', employeeMail: '', employeePhone: '', employeeNote: '', nas: '',
      employeeCivicNumber: '', employeeSuite: '', employeeZipCode: '',
      employeeCity: '', employeeState: 'QC', employeeCountry: 'Canada', employeeAdressNote: '',
    };
  }
}
