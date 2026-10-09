import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Employee } from '../../../../models';
import { InitialsPipe } from '../../../shared/initials.pipe';

/**
 * Carte de profil de l'employé sélectionné (présentation seule) : coordonnées, compagnies
 * affectées, statut actif, type d'emploi, statut de la semaine affichée, accès à la fiche.
 */
@Component({
    selector: 'app-employee-profile-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, RouterLink, InitialsPipe],
    templateUrl: './employee-profile-card.component.html',
    styleUrls: ['./employee-profile-card.component.scss']
})
export class EmployeeProfileCardComponent {
  @Input({ required: true }) employee!: Employee;
  /** La semaine affichée est validée (verrouillée). */
  @Input() weekLocked = false;
  /** Affiche le lien « Modifier la fiche » (permission employees.edit). */
  @Input() canEdit = false;

  /** « Ville · Province » sans séparateur orphelin quand un champ manque. */
  get location(): string {
    return [this.employee.employeeCity, this.employee.employeeState].filter(v => !!v?.trim()).join(' · ');
  }

  /** Compagnies affichées : uniquement les compagnies actives (une compagnie désactivée reste liée mais n'est pas montrée). */
  get activeCompanies() {
    return (this.employee.employeeCompagnies ?? []).filter(c => c.isActive !== false);
  }

  get isPermanent(): boolean {
    return (this.employee.employeeType ?? 'Permanent') === 'Permanent';
  }
}
