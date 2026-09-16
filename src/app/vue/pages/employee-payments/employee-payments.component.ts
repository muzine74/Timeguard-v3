import { Component, DestroyRef, HostListener, inject, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeesService } from '../../../state/employees/employees.service';
import { EmployeePaymentsService, EmployeePaymentRow, EmployeePaymentWorkDay } from '../../../state/employee-payments/employee-payments.service';

type FilterMode = 'period' | 'range';

interface PaymentRowState extends EmployeePaymentRow {
  saving: boolean;
  saveMessage: string;
  selectedDays: Set<string>; // dates (yyyy-MM-dd) cochées comme "à payer"
}

interface WeekBlock {
  weekStart: string;
  weekEnd: string;
  days: EmployeePaymentWorkDay[];
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
            // Par défaut, toutes les journées travaillées sont cochées (= montant payé = gain cumulé)
            selectedDays: new Set(r.workDays.map(w => w.date)),
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

  isDaySelected(row: PaymentRowState, date: string): boolean {
    return row.selectedDays.has(date);
  }

  toggleDay(row: PaymentRowState, date: string): void {
    if (row.selectedDays.has(date)) row.selectedDays.delete(date);
    else row.selectedDays.add(date);
    row.amountPaid = this._computeAmountPaid(row);
    this.cdr.markForCheck();
  }

  private _computeAmountPaid(row: PaymentRowState): number {
    const sum = row.workDays
      .filter(w => row.selectedDays.has(w.date))
      .reduce((s, w) => s + w.amount, 0);
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
      .filter(w => row.selectedDays.has(w.date))
      .reduce((s, w) => s + w.amount, 0);
    return Math.round(sum * 100) / 100;
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

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
