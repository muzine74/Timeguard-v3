import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Employee } from '../../../../models';
import { InitialsPipe } from '../../../shared/initials.pipe';
import { ExportButtonsComponent } from '../../../components/export-buttons/export-buttons.component';
import { SearchHintComponent } from '../../../components/search-hint/search-hint.component';
import { ExportDoc } from '../../../../state/export/table-export.service';
import { multiMatch, kw } from '../../../shared/multi-search';
import { employeeSearchFields, employeesExportDoc } from '../../../shared/entity-search';

export type EmployeeStatusFilter = 'all' | 'pending' | 'validated';
/** État de l'employé : actifs (par défaut, comportement d'origine), désactivés, ou tous. */
export type EmployeeActiveFilter = 'all' | 'active' | 'inactive';

/**
 * Liste des employés de la page Employés : recherche + filtre par statut de validation
 * (combinés en ET), compteurs, tri « à valider d'abord ». État d'interface local ;
 * la sélection est remontée au conteneur via (employeeSelect).
 */
@Component({
    selector: 'app-employee-list-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, InitialsPipe, ExportButtonsComponent, SearchHintComponent],
    templateUrl: './employee-list-panel.component.html',
    styleUrls: ['./employee-list-panel.component.scss']
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
  readonly activeFilter = signal<EmployeeActiveFilter>('active');

  /** Employés correspondant à la recherche, tous états confondus (base des compteurs Tous / Actifs / Désactivés). */
  private get queryMatches(): Employee[] {
    // Critères « & » (ET) / « | » (OU) : nom, courriel, ville…, « actif » / « inactif », « validé » / « à valider »
    const q = this.searchQuery();
    return this.employees.filter(e => multiMatch(q, employeeSearchFields(e), kw(this.isValidated(e.employeeId) ? 'validé' : 'à valider')));
  }

  get activeCounts(): { all: number; active: number; inactive: number } {
    const list = this.queryMatches;
    const active = list.filter(e => e.isActive).length;
    return { all: list.length, active, inactive: list.length - active };
  }

  isValidated(employeeId: string): boolean {
    return this.validated.get(employeeId.toLowerCase()) ?? false;
  }

  /** Recherche + filtre Tous / Actifs / Désactivés (avant le filtre de validation). */
  private get searchMatches(): Employee[] {
    const a = this.activeFilter();
    return this.queryMatches.filter(e => a === 'all' || (a === 'active') === !!e.isActive);
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

  /** Export de la liste affichée (recherche + filtres d'état et de validation). */
  exportEmployees = (): ExportDoc => {
    const rows = this.filteredEmployees;
    const doc = employeesExportDoc(rows, { name: 'Employes', title: 'Employés', search: this.searchQuery() });
    const t = doc.tables[0];
    t.columns.push({ header: 'Semaines', width: 12 });
    t.rows.forEach((r, i) => r.cells.push(this.isValidated(rows[i].employeeId) ? 'Validées' : 'À valider'));
    return doc;
  };

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  trackByEmployee(_: number, e: Employee): string { return e.employeeId; }
}
