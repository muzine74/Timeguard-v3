import { Component, OnInit, signal, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { EmployeesService } from '../../../state/employees/employees.service';
import { Employee, EmployeeFile } from '../../../models';

@Component({
    selector: 'app-employee-validation',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './employee-validation.component.html',
    styleUrls: ['./employee-validation.component.scss']
})
export class EmployeeValidationComponent implements OnInit {
  empLoading    = this.empSvc.loading;
  loadingDetail = signal(false);

  employeeId   = signal('');
  selected     = signal<Employee | null>(null);
  searchQuery  = '';

  isActive      = signal(true);
  files         = signal<EmployeeFile[]>([]);
  fileUploading = signal(false);
  fileError     = signal('');

  private destroyRef = inject(DestroyRef);
  private get _dev() { return isDevMode(); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeValidation]', ...a); }

  /** Filtre Tous / Actifs / Désactivés (Actifs par défaut = comportement d'origine). */
  activeFilter = signal<'all' | 'active' | 'inactive'>('active');

  /** Employés correspondant à la recherche, tous états confondus (base des compteurs). */
  private get queryMatches(): Employee[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.empSvc.list().filter(e => !q || e.employeeName.toLowerCase().includes(q));
  }

  get activeCounts(): { all: number; active: number; inactive: number } {
    const list = this.queryMatches;
    const active = list.filter(e => e.isActive).length;
    return { all: list.length, active, inactive: list.length - active };
  }

  get filteredEmployees(): Employee[] {
    const a = this.activeFilter();
    return this.queryMatches.filter(e => a === 'all' || (a === 'active') === !!e.isActive);
  }

  constructor(
    private empSvc: EmployeesService,
    private route:  ActivatedRoute,
    private cdr:    ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    // Tous les employés : la liste filtre ensuite Tous / Actifs / Désactivés
    this.empSvc.loadList(false);
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.selectEmployee(id);
  }

  selectEmployee(id: string): void {
    if (id === this.employeeId()) return;
    this.employeeId.set(id);
    this.selected.set(null);
    this.fileError.set('');
    this.loadingDetail.set(true);

    this.empSvc.getOne(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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

  /** Photo prise avec l'appareil (mobile) : réduite en JPEG puis jointe immédiatement. */
  async onPhotoTaken(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const raw   = input.files?.[0];
    if (!raw || !this.employeeId()) return;

    this.fileError.set('');
    this.fileUploading.set(true);
    try {
      const photo = await this._toJpeg(raw);
      this._upload(photo, input);
    } catch {
      this.fileUploading.set(false);
      input.value = '';
      this.fileError.set('Impossible de lire la photo. Réessayez ou utilisez « + Ajouter ».');
    }
  }

  /** Réduit l'image (côté le plus long ≤ 2000 px, JPEG 85 %) : reste sous la limite de 10 Mo
   *  de l'API et convertit les formats non acceptés (HEIC…) en JPEG. Nom : Photo_AAAA-MM-JJ_HHMMSS.jpg */
  private _toJpeg(file: File): Promise<File> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale  = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('toBlob'));
          const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
          const name = `Photo_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file || !this.employeeId()) return;
    this._upload(file, input);
  }

  private _upload(file: File, input: HTMLInputElement): void {
    this.fileError.set('');
    this.fileUploading.set(true);
    this.empSvc.uploadFile(this.employeeId(), file).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.empSvc.downloadFile(this.employeeId(), fileId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
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
    this.empSvc.deleteFile(this.employeeId(), fileId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this._loadFiles(this.employeeId()),
      error: err => this.fileError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`),
    });
  }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  private _loadFiles(id: string): void {
    this.empSvc.getFiles(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => { this.files.set(list); this.cdr.markForCheck(); },
      error: ()  => {},
    });
  }
}
