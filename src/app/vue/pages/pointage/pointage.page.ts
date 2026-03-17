import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeeFormComponent }  from '../../components/employee-form/employee-form.component';
import { StatsBarComponent }      from '../../components/stats-bar/stats-bar.component';
import { SectionHeaderComponent } from '../../components/section-header/section-header.component';
import { PointageTableComponent } from '../../components/pointage-table/pointage-table.component';
import { WeekService, PointageEmployeeService, PointageAdminService, SaveStateService } from '../../../state/pointage/pointage.service';

@Component({
  selector: 'app-pointage-page',
  standalone: true,
  imports: [CommonModule, EmployeeFormComponent, StatsBarComponent, SectionHeaderComponent, PointageTableComponent],
  templateUrl: './pointage.page.html',
})
export class PointagePage implements OnInit {
  saved    = signal(false);
  toast    = '';
  progress = this.saveSvc.progress;
  isSaving = this.saveSvc.isSaving;

  constructor(
    public weekSvc:  WeekService,
    public ptEmpSvc: PointageEmployeeService,
    public admSvc:   PointageAdminService,
    public saveSvc:  SaveStateService,
  ) {}

  ngOnInit(): void {
    const week = this.weekSvc.weekKey();
    this.ptEmpSvc.load(week);
    setTimeout(() => { this.admSvc.syncFromEmployee(); this.admSvc.load(week); }, 50);
  }

  onWeekChange(): void {
    const week = this.weekSvc.weekKey();
    this.ptEmpSvc.load(week);
    setTimeout(() => { this.admSvc.syncFromEmployee(); this.admSvc.load(week); }, 50);
  }

  async save(): Promise<void> {
    const ok = await this.saveSvc.save();
    this.toast = ok ? '✓ Données sauvegardées' : '✕ Erreur lors de la sauvegarde';
    this.saved.set(true);
    setTimeout(() => this.saved.set(false), 3000);
  }
}
