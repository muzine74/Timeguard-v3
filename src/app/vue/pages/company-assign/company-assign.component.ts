import { Component, OnInit, HostListener, computed, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { EmployeesService } from '../../../state/employees/employees.service';
import { CompanyService, CompanySummary } from '../../../state/compagny/Company.service';
import { Employee } from '../../../models';
import { ConfirmService } from '../../../state/ui/confirm.service';
import { httpErrorMessage } from '../../shared/http-error';

@Component({
    selector: 'app-company-assign',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './company-assign.component.html',
    styleUrls: ['./company-assign.component.scss']
})
export class CompanyAssignComponent implements OnInit {
  private readonly confirmDlg = inject(ConfirmService);
  private readonly noteAlerts = inject(NoteAlertService);

  // ── Service signals passés directement ────────────────
  readonly employees  = this.empSvc.list;
  readonly empLoading = this.empSvc.loading;

  // ── État local ────────────────────────────────────────
  companies      = signal<CompanySummary[]>([]);
  selected       = signal<Employee | null>(null);
  assigned       = signal<Set<string>>(new Set());
  original       = signal<Set<string>>(new Set());
  saving         = signal(false);
  saved          = signal(false);
  error          = signal('');
  empSearch      = signal('');
  coSearch       = signal('');
  companiesError = signal('');
  loadingAssigned = signal(false);

  // ── Computed ──────────────────────────────────────────
  filteredEmps = computed(() => {
    const q = this._norm(this.empSearch());
    return this.employees().filter(e =>
      e.isActive && (!q || this._norm(e.employeeName).includes(q))
    );
  });

  /** Minuscules, sans accents ni espaces autour (« Hotel » trouve « Hôtel »). */
  private _norm(s: string): string {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  hasChanges = computed(() => {
    const curr = this.assigned(), orig = this.original();
    if (curr.size !== orig.size) return true;
    for (const id of curr) if (!orig.has(id)) return true;
    return false;
  });

  // Compagnies assignées en tête, puis le reste trié par nom.
  // Seules les compagnies actives sont proposées. Une compagnie désactivée encore assignée n'est pas
  // affichée et son affectation reste telle quelle (la sauvegarde n'envoie que les différences).
  sortedCompanies = computed(() => {
    const assigned = this.assigned();
    return this.companies()
      .filter(c => c.isActive)
      .sort((a, b) => {
        const aAssigned = assigned.has(a.companyId);
        const bAssigned = assigned.has(b.companyId);
        if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
        return a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' });
      });
  });

  /** Nombre de compagnies actives assignées (les désactivées, masquées, ne sont pas comptées). */
  assignedCount = computed(() => {
    const assigned = this.assigned();
    return this.sortedCompanies().filter(c => assigned.has(c.companyId)).length;
  });

  /** Compagnies affichées : filtrées par le champ de recherche. */
  shownCompanies = computed(() => {
    const q = this._norm(this.coSearch());
    return q ? this.sortedCompanies().filter(c => this._norm(c.companyName).includes(q)) : this.sortedCompanies();
  });

  trackCompany(_: number, c: CompanySummary): string { return c.companyId; }

  constructor(
    private empSvc:     EmployeesService,
    private companySvc: CompanyService,
  ) {}

  ngOnInit(): void {
    this.empSvc.loadList();
    this.loadCompanies();
  }

  loadCompanies(): void {
    this.companiesError.set('');
    this.companySvc.getAll().subscribe({
      next:  list => this.companies.set(list),
      error: err  => this.companiesError.set(httpErrorMessage(err, `Impossible de charger les compagnies`)),
    });
  }

  /** Onglet fermé / page rechargée avec des affectations non sauvegardées : le navigateur demande confirmation. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (this.hasChanges()) { ev.preventDefault(); ev.returnValue = ''; }
  }

  // ── Sélection employé → récupère les compagnies à jour ─
  async select(emp: Employee): Promise<void> {
    if (this.selected()?.employeeId === emp.employeeId) return;
    if (this.saving()) return;
    if (this.hasChanges() && !await this.confirmDlg.discard(`Les affectations non sauvegardées de « ${this.selected()?.employeeName ?? 'cet employé'} » seront perdues.`)) return;
    this.coSearch.set('');
    this.noteAlerts.check({ employeeIds: [emp.employeeId] }, `Affectation — ${emp.employeeName}`);
    this.selected.set(emp);
    this.assigned.set(new Set());
    this.original.set(new Set());
    this.saved.set(false);
    this.error.set('');
    this.loadingAssigned.set(true);

    this.empSvc.getOne(emp.employeeId).subscribe({
      next: full => {
        if (this.selected()?.employeeId !== emp.employeeId) return;   // un autre employé a été choisi entre-temps
        this.selected.set(full);
        const ids = new Set((full.employeeCompagnies ?? []).map(c => c.compagnieId));
        this.assigned.set(new Set(ids));
        this.original.set(new Set(ids));
        this.loadingAssigned.set(false);
      },
      error: () => {
        if (this.selected()?.employeeId !== emp.employeeId) return;
        // Fallback : données déjà présentes dans la liste
        const ids = new Set((emp.employeeCompagnies ?? []).map(c => c.compagnieId));
        this.assigned.set(new Set(ids));
        this.original.set(new Set(ids));
        this.loadingAssigned.set(false);
      },
    });
  }

  // ── Toggle compagnie ──────────────────────────────────
  toggle(companyId: string): void {
    const s = new Set(this.assigned());
    s.has(companyId) ? s.delete(companyId) : s.add(companyId);
    this.assigned.set(s);
  }

  isAssigned(id: string): boolean { return this.assigned().has(id); }

  // ── Sauvegarde ────────────────────────────────────────
  save(): void {
    const emp = this.selected();
    if (!emp || !this.hasChanges()) return;

    const orig    = this.original();
    const curr    = this.assigned();
    const toAdd   = [...curr].filter(id => !orig.has(id));
    const toRemove = [...orig].filter(id => !curr.has(id));

    const calls = [
      ...toAdd.map(id    => this.empSvc.assignCompany(emp.employeeId, id)),
      ...toRemove.map(id => this.empSvc.unassignCompany(emp.employeeId, id)),
    ];

    if (calls.length === 0) return;

    this.saving.set(true);
    this.error.set('');

    forkJoin(calls).subscribe({
      next: () => {
        this.original.set(new Set(curr));
        // Mise à jour locale de l'employé
        const updated: Employee = {
          ...emp,
          employeeCompagnies: this.companies()
            .filter(c => curr.has(c.companyId))
            .map(c => ({ compagnieId: c.companyId, compagnieName: c.companyName })),
        };
        this.selected.set(updated);
        this.saving.set(false);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: err => {
        this.saving.set(false);
        // Une partie des changements a pu passer : on recharge l'état réel plutôt que d'afficher un état supposé
        this.error.set((httpErrorMessage(err, `La sauvegarde a échoué`)) + ' — les affectations ont été rechargées, vérifiez-les.');
        this.loadingAssigned.set(true);
        this.empSvc.getOne(emp.employeeId).subscribe({
          next: full => {
            if (this.selected()?.employeeId !== emp.employeeId) return;
            const ids = new Set((full.employeeCompagnies ?? []).map(c => c.compagnieId));
            this.selected.set(full);
            this.assigned.set(new Set(ids));
            this.original.set(new Set(ids));
            this.loadingAssigned.set(false);
          },
          error: () => this.loadingAssigned.set(false),
        });
      },
    });
  }

  selectEmpById(id: string): void {
    const e = this.employees().find(emp => emp.employeeId === id);
    if (e) this.select(e);
  }

  // ── Helpers ───────────────────────────────────────────
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }
}
