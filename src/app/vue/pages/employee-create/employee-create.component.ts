import { Component, signal, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EmployeesService } from '../../../state/employees/employees.service';
import { EmployeeFile, EmployeeForm } from '../../../models';

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

  // État post-création
  createdId     = signal('');
  files         = signal<EmployeeFile[]>([]);
  fileUploading = signal(false);
  fileError     = signal('');

  form: EmployeeForm = this._emptyForm();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[EmployeeCreate]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeCreate]', ...a); }

  constructor(
    private empSvc: EmployeesService,
    private router: Router,
    private cdr:    ChangeDetectorRef,
  ) {}

  submit(): void {
    if (!this.form.employeeName.trim()) {
      this.error.set('Le nom est requis.');
      return;
    }
    this.error.set('');
    this.saving.set(true);

    this.empSvc.create(this.form).subscribe({
      next: res => {
        this.log('✓ créé:', res.employeeId);
        this.saving.set(false);
        this.createdId.set(res.employeeId);
        this.cdr.detectChanges();
      },
      error: err => {
        this.warn('✕ create échoué:', err);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.createdId()) return;

    this.fileError.set('');
    this.fileUploading.set(true);
    this.empSvc.uploadFile(this.createdId(), file).subscribe({
      next: () => {
        this.fileUploading.set(false);
        this._loadFiles();
        input.value = '';
      },
      error: err => {
        this.fileError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.fileUploading.set(false);
        input.value = '';
      },
    });
  }

  openFile(fileId: string): void {
    this.empSvc.downloadFile(this.createdId(), fileId).subscribe({
      next: res => {
        const url = URL.createObjectURL(res.body!);
        const a   = document.createElement('a');
        a.href    = url;
        a.target  = '_blank';
        a.rel     = 'noopener';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: err => this.fileError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`),
    });
  }

  removeFile(fileId: string): void {
    this.empSvc.deleteFile(this.createdId(), fileId).subscribe({
      next: () => this._loadFiles(),
      error: err => this.fileError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`),
    });
  }

  done(): void { this.router.navigate(['/employees', this.createdId(), 'edit']); }
  cancel(): void { this.router.navigate(['/employees']); }

  private _loadFiles(): void {
    this.empSvc.getFiles(this.createdId()).subscribe({
      next: list => { this.files.set(list); this.cdr.markForCheck(); },
      error: ()  => {},
    });
  }

  private _emptyForm(): EmployeeForm {
    return {
      employeeName: '', employeeMail: '', employeePhone: '', employeeNote: '', nas: '',
      employeeCivicNumber: '', employeeSuite: '', employeeZipCode: '',
      employeeCity: '', employeeState: 'QC', employeeCountry: 'Canada', employeeAdressNote: '',
    };
  }
}
