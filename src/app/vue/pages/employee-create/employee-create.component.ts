import { Component, signal, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
  saved       = signal(false);
  error       = signal('');
  saving      = signal(false);
  fieldErrors = signal<Record<string, string>>({});

  // État post-création
  createdId     = signal('');
  files         = signal<EmployeeFile[]>([]);
  fileUploading = signal(false);
  fileError     = signal('');

  form: EmployeeForm = this._emptyForm();

  private destroyRef = inject(DestroyRef);
  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[EmployeeCreate]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeCreate]', ...a); }

  constructor(
    private empSvc: EmployeesService,
    private router: Router,
    private cdr:    ChangeDetectorRef,
  ) {}

  submit(): void {
    if (!this._validate()) return;

    this.error.set('');
    this.saving.set(true);

    this.empSvc.create(this.form).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.log('✓ créé:', res.employeeId);
        this.fieldErrors.set({});
        this.saving.set(false);
        this.createdId.set(res.employeeId);
        this.cdr.detectChanges();
      },
      error: err => {
        this.warn('✕ create échoué:', err);
        this.saving.set(false);
        this._applyServerErrors(err);
      },
    });
  }

  // ── Validation client-side ────────────────────────────────────────────────
  private _validate(): boolean {
    const errs: Record<string, string> = {};

    if (!this.form.employeeName.trim())
      errs['employeeName'] = 'Le nom est requis.';

    const mail = this.form.employeeMail?.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
      errs['employeeMail'] = 'Format courriel invalide.';

    const phone = this.form.employeePhone?.trim();
    if (phone && !/^[\d\s\-\+\(\)\.]{7,20}$/.test(phone))
      errs['employeePhone'] = 'Format téléphone invalide.';

    this.fieldErrors.set(errs);
    if (Object.keys(errs).length > 0) {
      this.error.set('Veuillez corriger les champs en erreur.');
      return false;
    }
    this.error.set('');
    return true;
  }

  // ── Parse ValidationProblemDetails (serveur) ──────────────────────────────
  private _applyServerErrors(err: any): void {
    const serverErrors = err?.error?.errors as Record<string, string[]> | undefined;
    if (serverErrors && Object.keys(serverErrors).length > 0) {
      const keyMap: Record<string, string> = {
        EmployeeName:  'employeeName',
        EmployeeMail:  'employeeMail',
        EmployeePhone: 'employeePhone',
        NAS:           'nas',
      };
      const mapped: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(serverErrors)) {
        const local = keyMap[k] ?? (k.charAt(0).toLowerCase() + k.slice(1));
        mapped[local] = msgs[0];
      }
      this.fieldErrors.set(mapped);
      this.error.set('Veuillez corriger les champs en erreur.');
    } else {
      this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.createdId()) return;

    this.fileError.set('');
    this.fileUploading.set(true);
    this.empSvc.uploadFile(this.createdId(), file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.empSvc.downloadFile(this.createdId(), fileId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.empSvc.deleteFile(this.createdId(), fileId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this._loadFiles(),
      error: err => this.fileError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`),
    });
  }

  done(): void { this.router.navigate(['/employees', this.createdId(), 'edit']); }
  cancel(): void { this.router.navigate(['/employees']); }

  private _loadFiles(): void {
    this.empSvc.getFiles(this.createdId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
