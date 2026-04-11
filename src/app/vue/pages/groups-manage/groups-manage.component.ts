import {
  Component, OnInit, signal, computed,
  ChangeDetectionStrategy, DestroyRef, inject,
} from '@angular/core';
import { CommonModule }    from '@angular/common';
import { FormsModule }     from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  GroupsService, GroupSummary, GroupDetail, PermissionDef,
} from '../../../state/groups/groups.service';
import { EmployeesService } from '../../../state/employees/employees.service';

@Component({
  selector: 'app-groups-manage',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './groups-manage.component.html',
  styleUrls: ['./groups-manage.component.scss'],
})
export class GroupsManageComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  // ── Listes ────────────────────────────────────────────────────────────
  groups      = signal<GroupSummary[]>([]);
  permissions = signal<PermissionDef[]>([]);
  loading     = signal(true);

  // ── Modules calculés depuis les permissions DB ─────────────────────
  permModules = computed(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of this.permissions()) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module)!.push(p);
    }
    return Array.from(map.entries()).map(([label, perms]) => ({ label, perms }));
  });

  // ── Formulaire groupe ─────────────────────────────────────────────────
  isNew        = signal(false);
  selectedId   = signal<number | null>(null);
  formName     = signal('');
  formDesc     = signal('');
  formPerms    = signal<string[]>([]);
  formEmpIds   = signal<string[]>([]);
  empSearch    = signal('');
  saving       = signal(false);
  deleting     = signal(false);
  error        = signal('');
  toast        = signal('');
  confirmDelete = signal(false);

  // ── Panneau permissions ───────────────────────────────────────────────
  showPermPanel  = signal(false);
  newPermKey     = signal('');
  newPermLabel   = signal('');
  newPermModule  = signal('');
  permSaving     = signal(false);
  permError      = signal('');
  confirmPermId  = signal<number | null>(null);

  // ── Computed ──────────────────────────────────────────────────────────
  permSet = computed(() => new Set(this.formPerms()));
  empSet  = computed(() => new Set(this.formEmpIds()));

  filteredEmployees = computed(() => {
    const q = this.empSearch().toLowerCase();
    const all = this.employeesSvc.list();
    return q ? all.filter(e => e.employeeName.toLowerCase().includes(q)) : all;
  });

  showPanel  = computed(() => this.isNew() || this.selectedId() !== null);
  panelTitle = computed(() => this.isNew() ? 'Nouveau groupe' : this.formName());

  constructor(
    private groupsSvc:   GroupsService,
    private employeesSvc: EmployeesService,
  ) {}

  ngOnInit(): void {
    this._loadGroups();
    this._loadPermissions();
    this.employeesSvc.loadList();
  }

  private _loadGroups(): void {
    this.loading.set(true);
    this.groupsSvc.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => { this.groups.set(list); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private _loadPermissions(): void {
    this.groupsSvc.getPermissions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => this.permissions.set(list),
    });
  }

  // ── Actions groupe ────────────────────────────────────────────────────
  newGroup(): void {
    this.selectedId.set(null);
    this.isNew.set(true);
    this._resetForm();
    this.confirmDelete.set(false);
    this.showPermPanel.set(false);
  }

  selectGroup(id: number): void {
    this.selectedId.set(id);
    this.isNew.set(false);
    this.error.set('');
    this.confirmDelete.set(false);
    this.showPermPanel.set(false);
    this.groupsSvc.getById(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (g: GroupDetail) => {
        this.formName.set(g.name);
        this.formDesc.set(g.description);
        this.formPerms.set([...g.permissions]);
        this.formEmpIds.set([...g.employeeIds]);
      },
    });
  }

  closePanel(): void {
    this.selectedId.set(null);
    this.isNew.set(false);
    this.confirmDelete.set(false);
    this._resetForm();
  }

  // ── Permissions (groupe) ──────────────────────────────────────────────
  hasPerm(key: string): boolean { return this.permSet().has(key); }

  togglePerm(key: string): void {
    const cur = new Set(this.formPerms());
    cur.has(key) ? cur.delete(key) : cur.add(key);
    this.formPerms.set([...cur]);
  }

  toggleModule(mod: { label: string; perms: PermissionDef[] }): void {
    const cur = new Set(this.formPerms());
    const allOn = mod.perms.every(p => cur.has(p.key));
    mod.perms.forEach(p => allOn ? cur.delete(p.key) : cur.add(p.key));
    this.formPerms.set([...cur]);
  }

  moduleAllOn(mod: { perms: PermissionDef[] }): boolean {
    return mod.perms.every(p => this.permSet().has(p.key));
  }

  moduleSomeOn(mod: { perms: PermissionDef[] }): boolean {
    return mod.perms.some(p => this.permSet().has(p.key)) && !this.moduleAllOn(mod);
  }

  // ── Employés ──────────────────────────────────────────────────────────
  hasEmp(id: string): boolean { return this.empSet().has(id); }

  toggleEmp(id: string): void {
    const cur = new Set(this.formEmpIds());
    cur.has(id) ? cur.delete(id) : cur.add(id);
    this.formEmpIds.set([...cur]);
  }

  // ── Enregistrer groupe ────────────────────────────────────────────────
  save(): void {
    if (!this.formName().trim()) { this.error.set('Le nom est requis.'); return; }
    this.error.set('');
    this.saving.set(true);

    const payload = {
      name:        this.formName().trim(),
      description: this.formDesc().trim(),
      permissions: this.formPerms(),
      employeeIds: this.formEmpIds(),
    };

    const req$ = this.isNew()
      ? this.groupsSvc.create(payload)
      : this.groupsSvc.update(this.selectedId()!, payload);

    req$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res: any) => {
        this.saving.set(false);
        if (this.isNew()) { this.isNew.set(false); this.selectedId.set(res.groupId); }
        this._showToast('Groupe enregistré.');
        this._loadGroups();
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
      },
    });
  }

  // ── Supprimer groupe ──────────────────────────────────────────────────
  askDelete(): void    { this.confirmDelete.set(true); }
  cancelDelete(): void { this.confirmDelete.set(false); }

  confirmDel(): void {
    const id = this.selectedId();
    if (!id) return;
    this.deleting.set(true);
    this.groupsSvc.delete(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.deleting.set(false);
        this.closePanel();
        this._showToast('Groupe supprimé.');
        this._loadGroups();
      },
      error: err => {
        this.deleting.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.confirmDelete.set(false);
      },
    });
  }

  // ── Panneau gestion permissions ───────────────────────────────────────
  openPermPanel(): void {
    this.showPermPanel.set(true);
    this.selectedId.set(null);
    this.isNew.set(false);
    this._resetPermForm();
  }

  closePermPanel(): void {
    this.showPermPanel.set(false);
    this._resetPermForm();
  }

  addPermission(): void {
    if (!this.newPermKey().trim())    { this.permError.set('Clé requise.');    return; }
    if (!this.newPermLabel().trim())  { this.permError.set('Libellé requis.'); return; }
    if (!this.newPermModule().trim()) { this.permError.set('Module requis.');  return; }
    this.permError.set('');
    this.permSaving.set(true);
    this.groupsSvc.createPermission({
      key:    this.newPermKey().trim().toLowerCase(),
      label:  this.newPermLabel().trim(),
      module: this.newPermModule().trim(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.permSaving.set(false);
        this._resetPermForm();
        this._loadPermissions();
        this._showToast('Permission ajoutée.');
      },
      error: err => {
        this.permSaving.set(false);
        this.permError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
      },
    });
  }

  askDeletePerm(id: number): void  { this.confirmPermId.set(id); }
  cancelDeletePerm(): void         { this.confirmPermId.set(null); }

  confirmDeletePerm(): void {
    const id = this.confirmPermId();
    if (!id) return;
    this.groupsSvc.deletePermission(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.confirmPermId.set(null);
        this._loadPermissions();
        this._showToast('Permission supprimée.');
      },
      error: err => this.permError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  private _resetForm(): void {
    this.formName.set('');
    this.formDesc.set('');
    this.formPerms.set([]);
    this.formEmpIds.set([]);
    this.empSearch.set('');
    this.error.set('');
  }

  private _resetPermForm(): void {
    this.newPermKey.set('');
    this.newPermLabel.set('');
    this.newPermModule.set('');
    this.permError.set('');
    this.confirmPermId.set(null);
  }

  private _toastTimer: any;
  private _showToast(msg: string): void {
    this.toast.set(msg);
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.set(''), 3000);
  }

  trackById(_: number, g: GroupSummary) { return g.groupId; }
  trackPermId(_: number, p: PermissionDef) { return p.permissionId; }
}
