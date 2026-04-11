import { Component, OnInit, signal, computed, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, pairwise, filter, take } from 'rxjs';
import { EmployeesService } from '../../../state/employees/employees.service';
import { CompanyService, CompanySummary } from '../../../state/compagny/Company.service';

@Component({
  selector: 'app-employee-assign',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-assign.component.html',
  styleUrls: ['./employee-assign.component.scss'],
})
export class EmployeeAssignComponent implements OnInit {

  // ── Compagnies (sidebar) ─────────────────────────────
  companies    = signal<CompanySummary[]>([]);
  coLoading    = signal(true);
  selectedCo   = signal<CompanySummary | null>(null);
  coSearch     = '';

  get filteredCompanies(): CompanySummary[] {
    const q = this.coSearch.toLowerCase();
    return q
      ? this.companies().filter(c => c.companyName.toLowerCase().includes(q))
      : this.companies();
  }

  // ── Employés (panneau droit) ─────────────────────────
  allEmployees    = this.empSvc.list;
  empLoading      = this.empSvc.loading;
  assigned        = signal<Set<string>>(new Set());
  original        = signal<Set<string>>(new Set());
  loadingAssigned = signal(false);
  empSearch       = '';

  // Employés filtrés par recherche, assignés en tête, puis triés par nom
  sortedEmployees = computed(() => {
    const q    = this.empSearch.toLowerCase();
    const asgn = this.assigned();
    const list = q
      ? this.allEmployees().filter(e => e.employeeName.toLowerCase().includes(q))
      : this.allEmployees();

    return [...list].sort((a, b) => {
      const aA = asgn.has(a.employeeId), bA = asgn.has(b.employeeId);
      if (aA !== bA) return aA ? -1 : 1;
      return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' });
    });
  });

  hasChanges = computed(() => {
    const curr = this.assigned(), orig = this.original();
    if (curr.size !== orig.size) return true;
    for (const id of curr) if (!orig.has(id)) return true;
    return false;
  });

  saving = signal(false);
  saved  = signal(false);
  error  = signal('');

  private destroyRef    = inject(DestroyRef);
  private _empLoading$  = toObservable(inject(EmployeesService).loading);

  constructor(
    private empSvc:     EmployeesService,
    private companySvc: CompanyService,
  ) {}

  ngOnInit(): void {
    this.empSvc.loadList();
    this.companySvc.getAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: list => { this.companies.set(list); this.coLoading.set(false); },
      error: () => {
        this.error.set('Impossible de charger les compagnies.');
        this.coLoading.set(false);
      },
    });
  }

  // ── Sélection compagnie → recalcule les assignations ─
  selectCompany(co: CompanySummary): void {
    if (this.selectedCo()?.companyId === co.companyId) return;
    this.selectedCo.set(co);
    this.saved.set(false);
    this.error.set('');
    this.loadingAssigned.set(true);

    // Recharge la liste, puis attend la fin du chargement pour lire les assignations
    this.empSvc.loadList();
    this._empLoading$.pipe(
      pairwise(),
      filter(([prev, curr]) => prev === true && curr === false),
      take(1),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      const ids = new Set(
        this.allEmployees()
          .filter(e => (e.employeeCompagnies ?? []).some(c => c.compagnieId === co.companyId))
          .map(e => e.employeeId)
      );
      this.assigned.set(new Set(ids));
      this.original.set(new Set(ids));
      this.loadingAssigned.set(false);
    });
  }

  toggle(employeeId: string): void {
    const s = new Set(this.assigned());
    s.has(employeeId) ? s.delete(employeeId) : s.add(employeeId);
    this.assigned.set(s);
  }

  isAssigned(id: string): boolean { return this.assigned().has(id); }

  // ── Sauvegarde ────────────────────────────────────────
  save(): void {
    const co = this.selectedCo();
    if (!co || !this.hasChanges()) return;

    const orig     = this.original();
    const curr     = this.assigned();
    const toAdd    = [...curr].filter(id => !orig.has(id));
    const toRemove = [...orig].filter(id => !curr.has(id));

    const calls = [
      ...toAdd.map(empId    => this.empSvc.assignCompany(empId, co.companyId)),
      ...toRemove.map(empId => this.empSvc.unassignCompany(empId, co.companyId)),
    ];

    if (calls.length === 0) return;

    this.saving.set(true);
    this.error.set('');

    forkJoin(calls).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.original.set(new Set(curr));
        this.empSvc.loadList();
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

  trackByCompanyId(_: number, c: CompanySummary): string { return c.companyId; }
  trackByEmployeeId(_: number, e: { employeeId: string }): string { return e.employeeId; }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return p.length >= 2
      ? (p[0][0] + p[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }
}
