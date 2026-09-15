import { Component, DestroyRef, HostListener, inject, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EmployeesService } from '../../../state/employees/employees.service';
import { EmployeePaymentsService, EmployeePaymentRow } from '../../../state/employee-payments/employee-payments.service';

type FilterMode = 'period' | 'range';

interface PaymentRowState extends EmployeePaymentRow {
  saving: boolean;
  saveMessage: string;
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
          this.rows.set(data.map(r => ({ ...r, saving: false, saveMessage: '' })));
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

  fmt(val: number): string {
    return val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  trackByEmployeeId(_: number, r: PaymentRowState): string { return r.employeeId; }
  trackByEmpId(_: number, e: { employeeId: string }): string { return e.employeeId; }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
