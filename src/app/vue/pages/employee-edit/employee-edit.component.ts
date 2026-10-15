import { Component, OnInit, signal, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { EmployeesService } from '../../../state/employees/employees.service';
import { TeamAssignmentComponent } from '../../components/team-assignment/team-assignment.component';
import { CredentialsService } from '../../../state/auth/credentials.service';
import { Employee, EmployeeFile, EmployeeForm } from '../../../models';
import { httpErrorMessage } from '../../shared/http-error';

@Component({
    selector: 'app-employee-edit',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink, TeamAssignmentComponent],
    templateUrl: './employee-edit.component.html',
    styleUrls: ['./employee-edit.component.scss']
})
export class EmployeeEditComponent implements OnInit {
  private readonly noteAlerts = inject(NoteAlertService);
  saved          = signal(false);
  error          = signal('');
  saving         = signal(false);
  loadingForm    = signal(false);
  isActive       = signal(true);
  togglingActive = signal(false);
  fieldErrors    = signal<Record<string, string>>({});

  // Lien de réinitialisation de mot de passe
  sendingResetLink = signal(false);
  resetLinkSent    = signal(false);
  resetLinkError   = signal('');
  resetNeedsCredential = signal(false);

  // Fichiers
  files        = signal<EmployeeFile[]>([]);
  fileUploading = signal(false);
  fileError    = signal('');

  // Liste depuis le service
  empLoading = this.empSvc.loading;

  employeeId   = signal('');
  searchQuery  = '';
  activeFilter: 'all' | 'active' | 'inactive' = 'active';

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
    const a = this.activeFilter;
    return this.queryMatches.filter(e => a === 'all' || (a === 'active') === !!e.isActive);
  }

  form: EmployeeForm = this._emptyForm();

  private destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  /** Bouton « Nouvel employé » : seulement pour qui peut créer un employé et ouvrir cette page. */
  canCreate(): boolean {
    return (this.auth.isSuperUser() || this.auth.hasPerm('employees.create')) && this.auth.canOpen('/employees/new');
  }
  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[EmployeeEdit]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[EmployeeEdit]', ...a); }

  constructor(
    private empSvc:   EmployeesService,
    private credSvc:  CredentialsService,
    private router:   Router,
    private route:    ActivatedRoute,
    private cdr:      ChangeDetectorRef,
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
    this.fieldErrors.set({});
    this.resetLinkSent.set(false);
    this.resetLinkError.set('');
    this.loadingForm.set(true);
    this.log(`selectEmployee(${id})`);
    this.noteAlerts.check({ employeeIds: [id] }, 'Modification de l\'employé');

    this.empSvc.getOne(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: emp => {
        this.form = this._fromEmployee(emp);
        this.isActive.set(emp.isActive);
        this.loadingForm.set(false);
        this.log('✓ formulaire rempli:', emp.employeeName);
        this.cdr.markForCheck();
        this._loadFiles(id);
      },
      error: err => {
        this.warn(`✕ getOne(${id}) échoué (${err.status})`);
        this.error.set(httpErrorMessage(err, `Impossible de charger`));
        this.loadingForm.set(false);
      },
    });
  }

  submit(): void {
    if (!this.employeeId()) { this.error.set('Aucun employé sélectionné.'); return; }
    if (!this._validate()) return;
    const teamError = TeamAssignmentComponent.validate(this.form);
    if (teamError) { this.error.set(teamError); return; }

    this.error.set('');
    this.saving.set(true);
    this.log(`submit() → PUT /api/employee/${this.employeeId()}`);

    this.empSvc.updateFull(this.employeeId(), this.form).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.fieldErrors.set({});
        this.saved.set(true);
        this.saving.set(false);
        this.log('✓ mise à jour réussie');
        this.empSvc.loadList();
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: err => {
        this.warn('✕ update échoué:', err);
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
      this.error.set(httpErrorMessage(err));
    }
  }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  toggleActive(): void {
    if (!this.employeeId()) return;
    const newState = !this.isActive();
    this.togglingActive.set(true);
    this.empSvc.setActive(this.employeeId(), newState).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.isActive.set(newState);
        this.togglingActive.set(false);
        this.empSvc.loadList();
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(httpErrorMessage(err));
        this.togglingActive.set(false);
      },
    });
  }

  cancel(): void { this.router.navigate(['/employees']); }

  sendResetLink(): void {
    if (!this.employeeId()) return;
    this.sendingResetLink.set(true);
    this.resetLinkSent.set(false);
    this.resetLinkError.set('');
    this.resetNeedsCredential.set(false);

    this.credSvc.sendResetLink(this.employeeId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.sendingResetLink.set(false);
        this.resetLinkSent.set(true);
        this.cdr.markForCheck();
        setTimeout(() => this.resetLinkSent.set(false), 5000);
      },
      error: err => {
        this.sendingResetLink.set(false);
        this.resetLinkError.set(httpErrorMessage(err));
        this.resetNeedsCredential.set(err?.error?.code === 'NO_CREDENTIAL');
        this.cdr.markForCheck();
      },
    });
  }

  goToCredentials(): void { this.router.navigate(['/employees/credentials']); }

  /** Photo prise avec l'appareil (mobile) : réduite en JPEG puis jointe immédiatement. */
  async onPhotoTaken(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const raw   = input.files?.[0];
    if (!raw || !this.employeeId()) return;

    this.fileError.set('');
    this.fileUploading.set(true);
    try {
      this._upload(await this._toJpeg(raw), input);
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
        this.fileError.set(httpErrorMessage(err));
        this.fileUploading.set(false);
        input.value = '';
      },
    });
  }

  removeFile(fileId: string): void {
    if (!this.employeeId()) return;
    this.empSvc.deleteFile(this.employeeId(), fileId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => this._loadFiles(this.employeeId()),
      error: err => this.fileError.set(httpErrorMessage(err)),
    });
  }

  openFile(fileId: string): void {
    this.empSvc.downloadFile(this.employeeId(), fileId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        const blob = res.body!;
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.target   = '_blank';
        a.rel      = 'noopener';
        // Ouvre dans un nouvel onglet ; si le navigateur ne peut pas afficher
        // le type (ex: .doc), déclenche un téléchargement à la place
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      error: err => this.fileError.set(httpErrorMessage(err)),
    });
  }

  private _loadFiles(id: string): void {
    this.empSvc.getFiles(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => { this.files.set(list); this.cdr.markForCheck(); },
      error: ()  => {},
    });
  }

  private _fromEmployee(e: Employee): EmployeeForm {
    return {
      employeeName:        e.employeeName        ?? '',
      employeeMail:        e.employeeMail        ?? '',
      employeePhone:       e.employeePhone       ?? '',
      employeeNote:        e.employeeNote        ?? '',
      nas:                 e.nas                 ?? '',
      employeeType:        e.employeeType        ?? 'Permanent',
      modeRemuneration:    e.modeRemuneration    ?? 'Visite',
      tpsNumber:           e.tpsNumber           ?? '',
      tvqNumber:           e.tvqNumber           ?? '',
      isTeamLead:          !!e.isTeamLead,
      managerId:           e.managerId ?? null,
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
      employeeType: 'Permanent',
      modeRemuneration: 'Visite',
      tpsNumber: '', tvqNumber: '',
      isTeamLead: false,
      managerId: null,
      employeeCivicNumber: '', employeeSuite: '', employeeZipCode: '',
      employeeCity: '', employeeState: 'QC', employeeCountry: 'Canada', employeeAdressNote: '',
    };
  }
}
