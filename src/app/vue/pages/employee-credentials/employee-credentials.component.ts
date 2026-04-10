import {
  Component, OnInit, signal, computed,
  ChangeDetectionStrategy, DestroyRef, inject,
} from '@angular/core';
import { CommonModule }           from '@angular/common';
import { FormsModule }            from '@angular/forms';
import { takeUntilDestroyed }     from '@angular/core/rxjs-interop';
import { CredentialsService, CredentialResponse } from '../../../state/auth/credentials.service';
import { EmployeesService }       from '../../../state/employees/employees.service';
import { GroupsService, GroupSummary } from '../../../state/groups/groups.service';

@Component({
  selector: 'app-employee-credentials',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-credentials.component.html',
  styleUrls: ['./employee-credentials.component.scss'],
})
export class EmployeeCredentialsComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  // ── Liste ─────────────────────────────────────────────────────────────
  credentials = signal<CredentialResponse[]>([]);
  loading     = signal(true);

  // ── Panneau formulaire ────────────────────────────────────────────────
  showForm     = signal(false);
  formEmpId    = signal('');
  formUser     = signal('');
  formPass     = signal('');
  showPass     = signal(false);
  formGroupIds = signal<number[]>([]);

  // ── Groupes disponibles ───────────────────────────────────────────────
  groups       = signal<GroupSummary[]>([]);

  // ── Réinitialisation mot de passe ─────────────────────────────────────
  resetId     = signal<number | null>(null);
  resetPass   = signal('');
  showReset   = signal(false);

  // ── Suppression ───────────────────────────────────────────────────────
  deleteId    = signal<number | null>(null);

  // ── Feedback ─────────────────────────────────────────────────────────
  saving      = signal(false);
  error       = signal('');
  toast       = signal('');

  // ── Recherche ─────────────────────────────────────────────────────────
  search      = signal('');

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    return q
      ? this.credentials().filter(c =>
          c.username.toLowerCase().includes(q) ||
          c.employeeName.toLowerCase().includes(q))
      : this.credentials();
  });

  constructor(
    private credSvc:      CredentialsService,
    private employeeSvc:  EmployeesService,
    private groupsSvc:    GroupsService,
  ) {}

  ngOnInit(): void {
    this._load();
    this.employeeSvc.loadList();
    this.groupsSvc.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => this.groups.set(list),
    });
  }

  private _load(): void {
    this.loading.set(true);
    this.credSvc.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => { this.credentials.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ── Sélection employé (depuis signal list) ────────────────────────────
  get employees() { return this.employeeSvc.list(); }

  // ── Formulaire création ───────────────────────────────────────────────
  openForm(): void {
    this.showForm.set(true);
    this.formEmpId.set('');
    this.formUser.set('');
    this.formPass.set('');
    this.showPass.set(false);
    this.formGroupIds.set([]);
    this.error.set('');
  }

  closeForm(): void { this.showForm.set(false); this.formGroupIds.set([]); this.error.set(''); }

  toggleGroup(id: number): void {
    const current = this.formGroupIds();
    this.formGroupIds.set(
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );
  }

  create(): void {
    if (!this.formEmpId()) { this.error.set('Sélectionnez un employé.'); return; }
    if (!this.formUser().trim()) { this.error.set("Nom d'utilisateur requis."); return; }
    if (this.formPass().length < 4) { this.error.set('Mot de passe : minimum 4 caractères.'); return; }

    this.saving.set(true);
    this.error.set('');
    const empId    = this.formEmpId();
    const groupIds = this.formGroupIds();
    this.credSvc.create({
      employeeId: empId,
      username:   this.formUser().trim(),
      password:   this.formPass(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (groupIds.length === 0) { this._onCreateDone(); return; }
        this._assignGroups(empId, groupIds, 0, () => this._onCreateDone());
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
      },
    });
  }

  // ── Reset mot de passe ────────────────────────────────────────────────
  openReset(id: number): void {
    this.resetId.set(id);
    this.resetPass.set('');
    this.showReset.set(false);
    this.error.set('');
  }

  closeReset(): void { this.resetId.set(null); this.error.set(''); }

  confirmReset(): void {
    const id = this.resetId();
    if (!id) return;
    if (this.resetPass().length < 4) { this.error.set('Minimum 4 caractères.'); return; }
    this.saving.set(true);
    this.credSvc.resetPassword(id, this.resetPass()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.closeReset();
        this._showToast('Mot de passe réinitialisé.');
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
      },
    });
  }

  // ── Suppression ───────────────────────────────────────────────────────
  askDelete(id: number): void  { this.deleteId.set(id); this.error.set(''); }
  cancelDelete(): void         { this.deleteId.set(null); }

  confirmDelete(): void {
    const id = this.deleteId();
    if (!id) return;
    this.saving.set(true);
    this.credSvc.delete(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.deleteId.set(null);
        this._showToast('Credential supprimé.');
        this._load();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
      },
    });
  }

  // ── Helpers création + groupes ────────────────────────────────────────
  private _onCreateDone(): void {
    this.saving.set(false);
    this.closeForm();
    this._showToast('Credential créé.');
    this._load();
  }

  private _assignGroups(empId: string, groupIds: number[], idx: number, done: () => void): void {
    if (idx >= groupIds.length) { done(); return; }
    const gid = groupIds[idx];
    this.groupsSvc.getById(gid).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => {
        const ids = detail.employeeIds.includes(empId)
          ? detail.employeeIds
          : [...detail.employeeIds, empId];
        this.groupsSvc.update(gid, {
          name: detail.name, description: detail.description,
          permissions: detail.permissions, employeeIds: ids,
        }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
          next:  () => this._assignGroups(empId, groupIds, idx + 1, done),
          error: () => this._assignGroups(empId, groupIds, idx + 1, done),
        });
      },
      error: () => this._assignGroups(empId, groupIds, idx + 1, done),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private _toastTimer: any;
  private _showToast(msg: string): void {
    this.toast.set(msg);
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.set(''), 3000);
  }

  employeeName(id: number): string {
    return this.credentials().find(c => c.credentialId === id)?.employeeName ?? '';
  }

  trackById(_: number, c: CredentialResponse) { return c.credentialId; }
}
