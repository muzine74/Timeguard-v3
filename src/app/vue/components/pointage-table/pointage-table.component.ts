import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeekService }             from '../../../state/pointage/pointage.service';
import { PointageEmployeeService } from '../../../state/pointage/pointage.service';
import { PointageAdminService }    from '../../../state/pointage/pointage.service';
import { Compagnie, WeekDay }      from '../../../models/index';

@Component({
  selector: 'app-pointage-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pointage-table.component.html',
  styleUrls:   ['./pointage-table.component.scss'],
})
export class PointageTableComponent {
  @Input() mode: 'employee' | 'admin' = 'employee';

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

  get weekDays(): WeekDay[] { return this.weekSvc.weekDays(); }
  get isAdmin(): boolean    { return this.mode === 'admin'; }

  isChecked(c: Compagnie, dk: string): boolean {
    return this.isAdmin
      ? this.admSvc.isChecked(c, dk)
      : this.ptEmpSvc.isChecked(c, dk);
  }

  toggle(c: Compagnie, dk: string, e: Event): void {
    e.stopPropagation();
    this.isAdmin
      ? this.admSvc.toggle(c.id, dk)
      : this.ptEmpSvc.toggle(c.id, dk);
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
}