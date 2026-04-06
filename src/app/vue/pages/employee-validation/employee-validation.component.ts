import { Component, OnInit, signal, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EmployeesService } from '../../../state/employees/employees.service';
import { Employee, EmployeeFile } from '../../../models';

@Component({
  selector: 'app-employee-validation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-validation.component.html',
  styleUrls: ['./employee-validation.component.scss'],
})
export class EmployeeValidationComponent implements OnInit {
  empLoading    = this.empSvc.loading;
  loadingDetail = signal(false);

  employeeId   = signal('');
  selected     = signal<Employee | null>(null);
  searchQuery  = '';
  activeFilter: 'all' | 'active' | 'inactive' = 'active';

  isActive      = signal(true);
  files         = signal<EmployeeFile[]>([]);
  fileUploading = signal(false);
  fileError     = signal('');

  private get _dev() { return isDevMode(); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeValidation]', ...a); }

  get filteredEmployees(): Employee[] {
    const q = this.searchQuery.toLowerCase();
    return this.empSvc.list().filter(e => {
      const matchSearch = !q || e.employeeName.toLowerCase().includes(q);
      const matchStatus = this.activeFilter === 'all'
        || (this.activeFilter === 'active'   &&  e.isActive)
        || (this.activeFilter === 'inactive' && !e.isActive);
      return matchSearch && matchStatus;
    });
  }

  constructor(
    private empSvc: EmployeesService,
    private route:  ActivatedRoute,
    private cdr:    ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.empSvc.loadList();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.selectEmployee(id);
  }

  selectEmployee(id: string): void {
    if (id === this.employeeId()) return;
    this.employeeId.set(id);
    this.selected.set(null);
    this.fileError.set('');
    this.loadingDetail.set(true);

    this.empSvc.getOne(id).subscribe({
      next: emp => {
        this.selected.set(emp);
        this.isActive.set(emp.isActive);
        this.loadingDetail.set(false);
        this.cdr.detectChanges();
        this._loadFiles(id);
      },
      error: err => {
        this.warn('✕ getOne échoué:', err.status);
        this.loadingDetail.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.employeeId()) return;

    this.fileError.set('');
    this.fileUploading.set(true);
    this.empSvc.uploadFile(this.employeeId(), file).subscribe({
      next: () => {
        this.fileUploading.set(false);
        this._loadFiles(this.employeeId());
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
    this.empSvc.downloadFile(this.employeeId(), fileId).subscribe({
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
    this.empSvc.deleteFile(this.employeeId(), fileId).subscribe({
      next: () => this._loadFiles(this.employeeId()),
      error: err => this.fileError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`),
    });
  }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  private _loadFiles(id: string): void {
    this.empSvc.getFiles(id).subscribe({
      next: list => { this.files.set(list); this.cdr.markForCheck(); },
      error: ()  => {},
    });
  }
}
