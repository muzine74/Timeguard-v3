import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeekService }             from '../../../state/pointage/week.service';
import { PointageEmployeeService } from '../../../state/pointage/pointage-employee.service';
import { PointageAdminService }    from '../../../state/pointage/pointage-admin.service';
import { Compagnie, WeekDay }      from '../../../models/index';

@Component({
  selector: 'app-pointage-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './pointage-table.component.html',
  styleUrls:   ['./pointage-table.component.scss'],
})
export class PointageTableComponent {
  @Input() mode:   'employee' | 'admin' = 'employee';
  @Input() locked: boolean              = false;

  constructor(
    public weekSvc:  WeekService,
    public ptEmpSvc: PointageEmployeeService,
    public admSvc:   PointageAdminService,
  ) {}

  get compagnies(): Compagnie[] {
    return this.mode === 'admin'
      ? this.admSvc.compagnies()
      : this.ptEmpSvc.compagnies();
  }

  /** Blocs séparés : compagnies pointées par visite (cases) / à l'heure (début-fin). */
  get visitRows():  Compagnie[] { return this.compagnies.filter(c => !c.hourly); }
  get hourlyRows(): Compagnie[] { return this.compagnies.filter(c => !!c.hourly); }
  get hasHourly():  boolean     { return this.compagnies.some(c => !!c.hourly); }

  get weekDays(): WeekDay[] { return this.weekSvc.weekDays(); }
  get isAdmin(): boolean    { return this.mode === 'admin'; }

  /** Vrai si la cellule est cliquable */
  get canEdit(): boolean { return this.isAdmin || !this.locked; }

  isChecked(c: Compagnie, dk: string): boolean {
    return this.isAdmin
      ? this.admSvc.isChecked(c, dk)
      : this.ptEmpSvc.isChecked(c, dk);
  }

  toggle(c: Compagnie, dk: string, e: Event): void {
    e.stopPropagation();
    if (!this.canEdit) return;
    this.isAdmin
      ? this.admSvc.toggle(c.id, dk)
      : this.ptEmpSvc.toggle(c.id, dk);
  }

  // ── Lignes horaires ───────────────────────────────────────────────────
  hoursOf(c: Compagnie, dk: string) { return this.ptEmpSvc.hoursOf(c, dk); }
  addRange(c: Compagnie, dk: string): void    { if (this.canEdit) this.ptEmpSvc.addRange(c.id, dk); }
  removeRange(c: Compagnie, dk: string, i: number): void { if (this.canEdit) this.ptEmpSvc.removeRange(c.id, dk, i); }
  duration(c: Compagnie, dk: string): number | null { return PointageEmployeeService.duration(c.hours?.[dk]); }
  invalid(c: Compagnie, dk: string): boolean { return PointageEmployeeService.isInvalid(c.hours?.[dk]); }
  totalHours(c: Compagnie): number { return this.ptEmpSvc.totalHours(c, this.weekDays); }

  setHours(c: Compagnie, dk: string, index: number, field: 'begin' | 'end', e: Event): void {
    if (!this.canEdit) return;
    this.ptEmpSvc.setHours(c.id, dk, index, field, (e.target as HTMLInputElement).value);
  }

  count(c: Compagnie): number {
    return this.isAdmin
      ? this.admSvc.count(c, this.weekDays)
      : this.ptEmpSvc.count(c, this.weekDays);
  }

  select(c: Compagnie): void {
    
  }

  trackById(_: number, c: Compagnie): number { return c.id; }
  trackByKey(_: number, d: WeekDay):  string  { return d.dateKey; }
  trackByIndex(i: number): number { return i; }
}