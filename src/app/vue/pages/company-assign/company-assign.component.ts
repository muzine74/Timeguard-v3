import { Component, OnInit, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { EmployeesService } from '../../../state/employees/employees.service';
import { CompanyService, CompanySummary } from '../../../state/compagny/Company.service';
import { Employee } from '../../../models';

@Component({
  selector: 'app-company-assign',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-assign.component.html',
  styleUrls: ['./company-assign.component.scss'],
})
export class CompanyAssignComponent implements OnInit {

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
  loadingAssigned = signal(false);

  // ── Computed ──────────────────────────────────────────
  filteredEmps = computed(() => {
    const q = this.empSearch().toLowerCase();
    if (!q) return this.employees();
    return this.employees().filter(e =>
      e.employeeName.toLowerCase().includes(q)
    );
  });

  hasChanges = computed(() => {
    const curr = this.assigned(), orig = this.original();
    if (curr.size !== orig.size) return true;
    for (const id of curr) if (!orig.has(id)) return true;
    return false;
  });

  // Compagnies assignées en tête, puis le reste trié par nom
  sortedCompanies = computed(() => {
    const assigned = this.assigned();
    return [...this.companies()].sort((a, b) => {
      const aAssigned = assigned.has(a.companyId);
      const bAssigned = assigned.has(b.companyId);
      if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
      return a.companyName.localeCompare(b.companyName, undefined, { sensitivity: 'base' });
    });
  });

  constructor(
    private empSvc:     EmployeesService,
    private companySvc: CompanyService,
  ) {}

  ngOnInit(): void {
    this.empSvc.loadList();
    this.companySvc.getAll().subscribe({
      next:  list => this.companies.set(list),
      error: ()   => {},
    });
  }

  // ── Sélection employé → récupère les compagnies à jour ─
  select(emp: Employee): void {
    if (this.selected()?.employeeId === emp.employeeId) return;
    this.selected.set(emp);
    this.assigned.set(new Set());
    this.original.set(new Set());
    this.saved.set(false);
    this.error.set('');
    this.loadingAssigned.set(true);

    this.empSvc.getOne(emp.employeeId).subscribe({
      next: full => {
        this.selected.set(full);
        const ids = new Set((full.employeeCompagnies ?? []).map(c => c.compagnieId));
        this.assigned.set(new Set(ids));
        this.original.set(new Set(ids));
        this.loadingAssigned.set(false);
      },
      error: () => {
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
        this.error.set(`HTTP ${err.status} — ${err.message}`);
        this.saving.set(false);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────
  initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }
}
