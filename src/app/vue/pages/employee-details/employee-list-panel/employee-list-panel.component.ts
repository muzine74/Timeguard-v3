import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models';
import { InitialsPipe } from '../../../shared/initials.pipe';

export type EmployeeStatusFilter = 'all' | 'pending' | 'validated';

/**
 * Liste des employés de la page Employés : recherche + filtre par statut de validation
 * (combinés en ET), compteurs, tri « à valider d'abord ». État d'interface local ;
 * la sélection est remontée au conteneur via (employeeSelect).
 */
@Component({
  selector: 'app-employee-list-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, InitialsPipe],
  templateUrl: './employee-list-panel.component.html',
  styleUrls: ['./employee-list-panel.component.scss'],
})
export class EmployeeListPanelComponent {
  @Input() employees: Employee[] = [];
  @Input() loading = false;
  @Input() selectedId: string | null = null;
  /** employeeId (minuscules) → toutes ses semaines sont validées. */
  @Input() validated = new Map<string, boolean>();
  @Output() employeeSelect = new EventEmitter<string>();

  readonly searchQuery  = signal('');
  readonly statusFilter = signal<EmployeeStatusFilter>('all');

  isValidated(employeeId: string): boolean {
    return this.validated.get(employeeId.toLowerCase()) ?? false;
  }

  /** Employés actifs correspondant à la recherche (avant le filtre de statut). */
  private get searchMatches(): Employee[] {
    const q = this.searchQuery().trim().toLowerCase();
    return this.employees.filter(e =>
      e.isActive && (!q || e.employeeName.toLowerCase().includes(q))
    );
  }

  /** Compteurs des pastilles — calculés sur le résultat de la recherche. */
  get statusCounts(): { all: number; pending: number; validated: number } {
    const list = this.searchMatches;
    const validated = list.filter(e => this.isValidated(e.employeeId)).length;
    return { all: list.length, pending: list.length - validated, validated };
  }

  /** Recherche ET statut ; employés à valider en premier, puis ordre alphabétique. */
  get filteredEmployees(): Employee[] {
    const f = this.statusFilter();
    return this.searchMatches
      .filter(e => f === 'all' || (f === 'validated') === this.isValidated(e.employeeId))
      .sort((a, b) => {
        const aOk = this.isValidated(a.employeeId);
        const bOk = this.isValidated(b.employeeId);
        if (aOk !== bOk) return aOk ? 1 : -1;
        return a.employeeName.localeCompare(b.employeeName);
      });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  trackByEmployee(_: number, e: Employee): string { return e.employeeId; }
}
