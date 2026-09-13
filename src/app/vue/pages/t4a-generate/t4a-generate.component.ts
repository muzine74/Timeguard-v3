import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeesService } from '../../../state/employees/employees.service';
import { T4AService, T4AData } from '../../../state/t4a/t4a.service';

@Component({
  selector: 'app-t4a-generate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './t4a-generate.component.html',
  styleUrls: ['./t4a-generate.component.scss'],
})
export class T4aGenerateComponent implements OnInit {
  employeeId = '';
  year       = new Date().getFullYear();

  loading   = signal(false);
  generating = signal(false);
  error     = signal('');
  loaded    = signal(false);

  data: T4AData = this._emptyData();

  private destroyRef = inject(DestroyRef);

  constructor(
    public  employeesSvc: EmployeesService,
    private t4aSvc:       T4AService,
    private cdr:          ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.employeesSvc.loadList(true);
  }

  suggest(): void {
    if (!this.employeeId) { this.error.set('Sélectionnez un employé.'); return; }
    if (!this.year) { this.error.set('Indiquez une année.'); return; }

    this.error.set('');
    this.loading.set(true);
    this.t4aSvc.suggest(this.employeeId, this.year).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.data = { ...res };
        this.loading.set(false);
        this.loaded.set(true);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  get total(): number {
    return +(this.data.pension + this.data.lumpSum + this.data.commissions
      + this.data.incomeTaxDeducted + this.data.annuities + this.data.feesForServices).toFixed(2);
  }

  generate(): void {
    this.error.set('');
    this.generating.set(true);
    this.t4aSvc.generate(this.data).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        this.generating.set(false);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `T4A_${this.data.year}_${this.data.firstName}_${this.data.lastName}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.generating.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private _emptyData(): T4AData {
    return {
      employeeId: '', year: this.year,
      payerName: '', payerAddressLine1: '', payerAddressLine2: '', payerAddressLine3: '', payerAccountNumber: '',
      lastName: '', firstName: '', initials: '', addressLine1: '', addressLine2: '', addressLine3: '',
      sin: '', recipientAccountNumber: '', dentalBenefitsCode: '',
      pension: 0, lumpSum: 0, commissions: 0, incomeTaxDeducted: 0, annuities: 0, feesForServices: 0,
    };
  }
}
