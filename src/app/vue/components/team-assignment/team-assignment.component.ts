import { Component, Input, OnInit, ChangeDetectionStrategy, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmployeesService } from '../../../state/employees/employees.service';
import { EmployeeForm } from '../../../models';

/**
 * Rattachement hiérarchique d'un employé (fiche création / modification) :
 *   • case « Chef d'équipe » ;
 *   • « Chef d'équipe / Responsable » : obligatoire, sauf pour un chef au sommet de la hiérarchie.
 * Le serveur revalide (chef existant, sans boucle, chef avec équipe qui garde son rôle).
 */
@Component({
  selector: 'app-team-assignment',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Default,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="field span-full team-assign">
      <label class="team-check">
        <input type="checkbox" [(ngModel)]="form.isTeamLead" [id]="idPrefix + '-team-lead'" />
        Chef d'équipe <span class="team-check-hint">(supervise des employés et/ou d'autres chefs d'équipe)</span>
      </label>
    </div>
    <div class="field span-full">
      <label [for]="idPrefix + '-manager'">
        {{ form.isTeamLead ? 'Responsable' : "Chef d'équipe" }}
        <span aria-hidden="true" *ngIf="!form.isTeamLead">*</span>
      </label>
      <select class="inp inp-sel" [id]="idPrefix + '-manager'" [(ngModel)]="form.managerId"
              [attr.aria-required]="!form.isTeamLead"
              [attr.aria-invalid]="!!error"
              [attr.aria-describedby]="idPrefix + '-manager-hint'">
        <option [ngValue]="null">{{ form.isTeamLead ? '— Aucun : sommet de la hiérarchie —' : '— Choisir —' }}</option>
        <option *ngFor="let l of leads()" [ngValue]="l.employeeId">{{ l.employeeName }}</option>
      </select>
      <span class="field-hint" [id]="idPrefix + '-manager-hint'">
        <ng-container *ngIf="error"><span class="team-error">⚠ {{ error }}</span> </ng-container>
        <ng-container *ngIf="!leads().length">Aucun chef d'équipe pour l'instant : cochez « Chef d'équipe » sur la fiche d'un responsable. </ng-container>
        Le chef d'équipe consulte le pointage et les notes de son équipe (page « Équipe »).
      </span>
    </div>
  `,
  styles: [`
    .team-check { display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: 600; }
    .team-check input { width: 18px; height: 18px; accent-color: var(--accent); }
    .team-check-hint { font-weight: 400; color: var(--muted); font-size: 12px; }
    .team-error { color: var(--danger); font-weight: 600; }
  `],
})
export class TeamAssignmentComponent implements OnInit {
  @Input({ required: true }) form!: EmployeeForm;
  /** Fiche en cours de modification (exclue de la liste des chefs). */
  @Input() selfId: string | null = null;
  @Input() idPrefix = 'employee';

  private _selfId = signal<string | null>(null);

  constructor(private empSvc: EmployeesService) {}

  /** Chefs d'équipe sélectionnables (actifs ou non), sauf soi-même. */
  readonly leads = computed(() =>
    this.empSvc.list()
      .filter(e => e.isTeamLead && e.employeeId !== this._selfId())
      .sort((a, b) => a.employeeName.localeCompare(b.employeeName)));

  get error(): string | null { return TeamAssignmentComponent.validate(this.form); }

  ngOnInit(): void {
    this._selfId.set(this.selfId);
    if (!this.empSvc.list().length) this.empSvc.loadList();
  }

  /** Même règle que l'API : un employé (non chef) doit avoir un chef d'équipe. */
  static validate(form: EmployeeForm): string | null {
    return !form.isTeamLead && !form.managerId ? "Choisissez le chef d'équipe de cet employé." : null;
  }
}
