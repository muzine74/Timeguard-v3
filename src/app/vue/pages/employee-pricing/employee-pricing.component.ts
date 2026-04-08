import {
  Component, OnInit, signal, computed,
  ChangeDetectionStrategy, DestroyRef, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeesService } from '../../../state/employees/employees.service';
import { PricingService } from '../../../state/employees/pricing.service';
import { DayPricingHistory, Employee, EmployeeCompagnie } from '../../../models';

interface PricingRow {
  calendarId:    string;
  day:           string;
  defaultPrice:  number;
  currentPrice:  number | null;
  originalPrice: number | null;
  isInvalid:     boolean;
}

@Component({
  selector: 'app-employee-pricing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-pricing.component.html',
  styleUrls: ['./employee-pricing.component.scss'],
})
export class EmployeePricingComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  // ── Sidebar employés ─────────────────────────────────────────────────────
  allEmployees     = this.empSvc.list;
  empLoading       = this.empSvc.loading;
  empSearch        = '';
  showInactive     = signal(false);
  selectedEmployee = signal<Employee | null>(null);
  loadingEmployee  = signal(false);

  filteredEmployees = computed(() => {
    const q    = this.empSearch.toLowerCase();
    const list = this.showInactive()
      ? this.allEmployees()
      : this.allEmployees().filter(e => e.isActive);
    return q ? list.filter(e => e.employeeName.toLowerCase().includes(q)) : list;
  });

  // ── Sélecteur compagnie ──────────────────────────────────────────────────
  companies       = signal<EmployeeCompagnie[]>([]);
  selectedCompany = signal<EmployeeCompagnie | null>(null);

  // ── Tableau des tarifs ───────────────────────────────────────────────────
  rows    = signal<PricingRow[]>([]);
  loading = signal(false);
  saving  = signal(false);
  saved   = signal(false);
  error   = signal('');

  // ── Historique ───────────────────────────────────────────────────────────
  history        = signal<DayPricingHistory[]>([]);
  historyLoading = signal(false);
  showHistory    = signal(false);
  historyError   = signal('');

  hasChanges = computed(() =>
    this.rows().some(r => r.currentPrice !== r.originalPrice)
  );

  constructor(
    private empSvc:     EmployeesService,
    private pricingSvc: PricingService,
  ) {}

  ngOnInit(): void {
    this.empSvc.loadList();
  }

  // ── Sélection employé → charge la fiche complète (avec compagnies) ───────
  selectEmployee(emp: Employee): void {
    if (this.selectedEmployee()?.employeeId === emp.employeeId) return;

    this.selectedEmployee.set(null);
    this.companies.set([]);
    this.selectedCompany.set(null);
    this.rows.set([]);
    this.saved.set(false);
    this.error.set('');
    this.loadingEmployee.set(true);

    this.empSvc.getOne(emp.employeeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: full => {
          this.selectedEmployee.set(full);
          this.companies.set(full.employeeCompagnies ?? []);
          this.loadingEmployee.set(false);
        },
        error: () => {
          this.error.set('Impossible de charger les données de l\'employé.');
          this.loadingEmployee.set(false);
        },
      });
  }

  // ── Sélection compagnie → charge les tarifs ──────────────────────────────
  selectCompany(company: EmployeeCompagnie): void {
    if (this.selectedCompany()?.compagnieId === company.compagnieId) return;

    this.selectedCompany.set(company);
    this.rows.set([]);
    this.history.set([]);
    this.showHistory.set(false);
    this.saved.set(false);
    this.error.set('');
    this.historyError.set('');
    this.loading.set(true);

    const empId = this.selectedEmployee()!.employeeId;
    this.pricingSvc.getPricing(empId, company.compagnieId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: entries => {
          this.rows.set(entries.map(e => ({
            calendarId:    e.calendarId,
            day:           e.day,
            defaultPrice:  e.defaultPrice,
            currentPrice:  e.customPrice,
            originalPrice: e.customPrice,
            isInvalid:     false,
          })));
          this.loading.set(false);
        },
        error: err => {
          this.error.set(`Erreur chargement tarifs (HTTP ${err.status})`);
          this.loading.set(false);
        },
      });
  }

  // ── Chargement / toggle historique ──────────────────────────────────────
  toggleHistory(): void {
    if (this.showHistory()) { this.showHistory.set(false); return; }

    const emp = this.selectedEmployee();
    const co  = this.selectedCompany();
    if (!emp || !co) return;

    this.showHistory.set(true);
    this._loadHistory(emp.employeeId, co.compagnieId);
  }

  private _loadHistory(empId: string, companyId: string): void {
    this.historyLoading.set(true);
    this.historyError.set('');

    this.pricingSvc.getHistory(empId, companyId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.history.set(data);
          this.historyLoading.set(false);
        },
        error: err => {
          this.historyError.set(`Erreur (HTTP ${err.status})`);
          this.historyLoading.set(false);
        },
      });
  }

  // ── Mise à jour d'un tarif dans le tableau ───────────────────────────────
  updatePrice(calendarId: string, value: string): void {
    const parsed = value.trim() === '' ? null : parseFloat(value);
    this.rows.update(rows =>
      rows.map(r => r.calendarId === calendarId
        ? { ...r, currentPrice: parsed, isInvalid: false }
        : r)
    );
  }

  // ── Réinitialiser tous les overrides ─────────────────────────────────────
  resetAll(): void {
    this.rows.update(rows => rows.map(r => ({ ...r, currentPrice: null, isInvalid: false })));
  }

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  save(): void {
    const emp = this.selectedEmployee();
    const co  = this.selectedCompany();
    if (!emp || !co || !this.hasChanges()) return;

    // Validation : aucun prix négatif ou NaN
    const hasBad = this.rows().some(
      r => r.currentPrice !== null && (r.currentPrice < 0 || isNaN(r.currentPrice))
    );

    if (hasBad) {
      this.rows.update(rows => rows.map(r => ({
        ...r,
        isInvalid: r.currentPrice !== null && (r.currentPrice < 0 || isNaN(r.currentPrice)),
      })));
      this.error.set('Certains tarifs sont invalides (valeur négative ou incorrecte).');
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const payload = {
      overrides: this.rows().map(r => ({
        calendarId: r.calendarId,
        price:      r.currentPrice,
      })),
    };

    this.pricingSvc.savePricing(emp.employeeId, co.compagnieId, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.rows.update(rows => rows.map(r => ({ ...r, originalPrice: r.currentPrice, isInvalid: false })));
          this.saving.set(false);
          this.saved.set(true);
          if (this.showHistory()) this._loadHistory(emp!.employeeId, co!.compagnieId);
          setTimeout(() => this.saved.set(false), 3000);
        },
        error: err => {
          this.error.set(`Erreur sauvegarde (HTTP ${err.status}) — ${err.error?.message ?? ''}`);
          this.saving.set(false);
        },
      });
  }

  toggleInactive(): void { this.showInactive.update(v => !v); }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return p.length >= 2
      ? (p[0][0] + p[1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }

  trackById(_: number, row: PricingRow): string { return row.calendarId; }
}
