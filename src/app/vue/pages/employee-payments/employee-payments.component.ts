import { Component, DestroyRef, HostListener, inject, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeesService } from '../../../state/employees/employees.service';
import { EmployeePaymentsService, EmployeePaymentRow, EmployeePaymentWorkDay } from '../../../state/employee-payments/employee-payments.service';

type FilterMode = 'period' | 'range';
type ResultsView = 'daily' | 'company';

interface PaymentRowState extends EmployeePaymentRow {
  saving: boolean;
  saveMessage: string;
  // Clé = "date::compagnie" pour chaque contribution (jour, compagnie) -- cochée = comptée
  // dans le montant payé. Un jour est "sélectionné" quand toutes ses clés le sont ; une
  // compagnie (pour une semaine) pareil. Ça permet aux deux vues (journalière / compagnie)
  // de partager exactement la même logique de sélection et de total.
  selectedKeys: Set<string>;
}

interface WeekBlock {
  weekStart: string;
  weekEnd: string;
  days: EmployeePaymentWorkDay[];
}

interface CompanyBlock {
  name: string;
  total: number;
  days: { date: string; amount: number }[];
}

function dayCompanyKey(date: string, company: string): string {
  return `${date}::${company}`;
}

@Component({
  selector: 'app-employee-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-payments.component.html',
  styleUrls: ['./employee-payments.component.scss'],
})
export class EmployeePaymentsComponent {
  mode: FilterMode = 'period';
  period   = this._currentPeriod();
  dateFrom = '';
  dateTo   = '';

  selected = new Set<string>();
  dropdownOpen = signal(false);

  loading = signal(false);
  error   = signal('');
  rows    = signal<PaymentRowState[]>([]);
  expanded = new Set<string>();
  resultsView = signal<ResultsView>('daily');

  private destroyRef = inject(DestroyRef);

  constructor(
    public  employeesSvc: EmployeesService,
    private paymentsSvc:  EmployeePaymentsService,
    private cdr:          ChangeDetectorRef,
  ) {
    this.employeesSvc.loadList(true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!(ev.target as HTMLElement).closest('.emp-dropdown')) this.dropdownOpen.set(false);
  }

  toggleDropdown(): void {
    this.dropdownOpen.set(!this.dropdownOpen());
  }

  isSelected(employeeId: string): boolean {
    return this.selected.has(employeeId);
  }

  toggleEmployee(employeeId: string): void {
    if (this.selected.has(employeeId)) this.selected.delete(employeeId);
    else this.selected.add(employeeId);
  }

  selectedCount = computed(() => this.selected.size);

  selectedLabel(): string {
    const n = this.selected.size;
    if (n === 0) return 'Choisir des employés…';
    if (n === 1) return '1 employé sélectionné';
    return `${n} employés sélectionnés`;
  }

  private _periodDates(): { from: string; to: string } | null {
    if (this.mode === 'period') {
      if (!this.period) return null;
      const [y, m] = this.period.split('-').map(Number);
      const from = `${this.period}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const to = `${this.period}-${String(lastDay).padStart(2, '0')}`;
      return { from, to };
    }
    if (!this.dateFrom || !this.dateTo) return null;
    return { from: this.dateFrom, to: this.dateTo };
  }

  load(): void {
    this.error.set('');
    if (this.selected.size === 0) { this.error.set('Sélectionnez au moins un employé.'); return; }
    const range = this._periodDates();
    if (!range) { this.error.set('Sélectionnez une période valide.'); return; }
    if (range.from > range.to) { this.error.set('La date de début doit être avant la date de fin.'); return; }

    this.loading.set(true);
    this.paymentsSvc.getSummary(Array.from(this.selected), range.from, range.to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: data => {
          this.rows.set(data.map(r => ({
            ...r,
            saving: false,
            saveMessage: '',
            // Par défaut, toutes les contributions (jour, compagnie) sont cochées
            // (= montant payé = gain cumulé)
            selectedKeys: new Set(
              r.workDays.flatMap(w => w.companies.map(c => dayCompanyKey(w.date, c.name)))
            ),
          })));
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  hasMismatch(row: PaymentRowState): boolean {
    return Math.round(row.amountPaid * 100) !== Math.round(row.gainCumule * 100);
  }

  private _dayKeys(w: EmployeePaymentWorkDay): string[] {
    return w.companies.map(c => dayCompanyKey(w.date, c.name));
  }

  isDaySelected(row: PaymentRowState, w: EmployeePaymentWorkDay): boolean {
    const keys = this._dayKeys(w);
    return keys.length > 0 && keys.every(k => row.selectedKeys.has(k));
  }

  isDayPartial(row: PaymentRowState, w: EmployeePaymentWorkDay): boolean {
    const keys = this._dayKeys(w);
    const nSelected = keys.filter(k => row.selectedKeys.has(k)).length;
    return nSelected > 0 && nSelected < keys.length;
  }

  toggleDay(row: PaymentRowState, w: EmployeePaymentWorkDay): void {
    const keys = this._dayKeys(w);
    const selectAll = !this.isDaySelected(row, w); // partiel ou vide -> tout cocher ; complet -> tout décocher
    for (const k of keys) {
      if (selectAll) row.selectedKeys.add(k);
      else row.selectedKeys.delete(k);
    }
    row.amountPaid = this._computeAmountPaid(row);
    this.cdr.markForCheck();
  }

  private _computeAmountPaid(row: PaymentRowState): number {
    const sum = row.workDays
      .flatMap(w => w.companies.map(c => ({ key: dayCompanyKey(w.date, c.name), amount: c.amount })))
      .filter(x => row.selectedKeys.has(x.key))
      .reduce((s, x) => s + x.amount, 0);
    return Math.round(sum * 100) / 100;
  }

  saveRow(row: PaymentRowState): void {
    const range = this._periodDates();
    if (!range) return;

    row.saveMessage = '';
    row.saving = true;
    this.cdr.markForCheck();

    this.paymentsSvc.save({
      employeeId:  row.employeeId,
      periodStart: range.from,
      periodEnd:   range.to,
      amountPaid:  row.amountPaid,
      note:        this.hasMismatch(row) ? (row.note ?? '') : null,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        row.saving = false;
        row.saveMessage = '✓ Enregistré.';
        this.cdr.markForCheck();
      },
      error: err => {
        row.saving = false;
        row.saveMessage = err?.error?.message ?? `Erreur HTTP ${err.status}`;
        this.cdr.markForCheck();
      },
    });
  }

  isExpanded(employeeId: string): boolean {
    return this.expanded.has(employeeId);
  }

  toggleExpand(employeeId: string): void {
    if (this.expanded.has(employeeId)) this.expanded.delete(employeeId);
    else this.expanded.add(employeeId);
  }

  weekBlocks(row: PaymentRowState): WeekBlock[] {
    const byWeek = new Map<string, EmployeePaymentWorkDay[]>();
    for (const w of row.workDays) {
      const start = this._mondayOf(w.date);
      if (!byWeek.has(start)) byWeek.set(start, []);
      byWeek.get(start)!.push(w);
    }
    return Array.from(byWeek.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, days]) => ({
        weekStart,
        weekEnd: this._addDays(weekStart, 6),
        days: days.sort((a, b) => a.date.localeCompare(b.date)),
      }));
  }

  weekTotal(row: PaymentRowState, block: WeekBlock): number {
    const sum = block.days
      .flatMap(w => w.companies.map(c => ({ key: dayCompanyKey(w.date, c.name), amount: c.amount })))
      .filter(x => row.selectedKeys.has(x.key))
      .reduce((s, x) => s + x.amount, 0);
    return Math.round(sum * 100) / 100;
  }

  companyBlocks(block: WeekBlock): CompanyBlock[] {
    const byCompany = new Map<string, CompanyBlock>();
    for (const w of block.days) {
      for (const c of w.companies) {
        if (!byCompany.has(c.name)) byCompany.set(c.name, { name: c.name, total: 0, days: [] });
        const entry = byCompany.get(c.name)!;
        entry.total += c.amount;
        entry.days.push({ date: w.date, amount: c.amount });
      }
    }
    return Array.from(byCompany.values())
      .map(c => ({ ...c, total: Math.round(c.total * 100) / 100, days: c.days.sort((a, b) => a.date.localeCompare(b.date)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  isCompanySelected(row: PaymentRowState, c: CompanyBlock): boolean {
    const keys = c.days.map(d => dayCompanyKey(d.date, c.name));
    return keys.length > 0 && keys.every(k => row.selectedKeys.has(k));
  }

  isCompanyPartial(row: PaymentRowState, c: CompanyBlock): boolean {
    const keys = c.days.map(d => dayCompanyKey(d.date, c.name));
    const nSelected = keys.filter(k => row.selectedKeys.has(k)).length;
    return nSelected > 0 && nSelected < keys.length;
  }

  toggleCompany(row: PaymentRowState, c: CompanyBlock): void {
    const keys = c.days.map(d => dayCompanyKey(d.date, c.name));
    const selectAll = !this.isCompanySelected(row, c);
    for (const k of keys) {
      if (selectAll) row.selectedKeys.add(k);
      else row.selectedKeys.delete(k);
    }
    row.amountPaid = this._computeAmountPaid(row);
    this.cdr.markForCheck();
  }

  companyTooltip(c: CompanyBlock): string {
    return c.days.map(d => `${this.dayLabel(d.date)} — ${this.fmt(d.amount)}`).join('\n');
  }

  dayTooltip(w: EmployeePaymentWorkDay): string {
    if (w.companies.length === 0) return '';
    return w.companies.map(c => `${c.name} — ${this.fmt(c.amount)}`).join('\n');
  }

  dayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('fr-CA', { weekday: 'long', day: 'numeric', month: 'short' });
  }

  weekLabel(block: WeekBlock): string {
    const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
    return `Semaine du ${fmt(block.weekStart)} au ${fmt(block.weekEnd)}`;
  }

  private _mondayOf(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay(); // 0=dim, 1=lun, ...
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  }

  private _addDays(dateStr: string, n: number): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  trackByEmployeeId(_: number, r: PaymentRowState): string { return r.employeeId; }
  trackByEmpId(_: number, e: { employeeId: string }): string { return e.employeeId; }
  trackByDate(_: number, w: EmployeePaymentWorkDay): string { return w.date; }
  trackByWeekStart(_: number, b: WeekBlock): string { return b.weekStart; }
  trackByCompanyName(_: number, c: CompanyBlock): string { return c.name; }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
