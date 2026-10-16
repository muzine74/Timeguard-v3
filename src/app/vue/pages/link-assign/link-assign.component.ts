import { Component, ChangeDetectionStrategy, computed, inject, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { PERM } from '../../../state/auth/permissions';
import { ConfirmService } from '../../../state/ui/confirm.service';
import { CompanyAssignComponent } from '../company-assign/company-assign.component';
import { EmployeeAssignComponent } from '../employee-assign/employee-assign.component';

/** « Par employé » : un employé → ses compagnies. « Par compagnie » : une compagnie → ses employés. */
export type LinkMode = 'employee' | 'company';

/**
 * Chaque mode garde sa propre adresse, donc son droit d'action et son droit de page (inchangés) :
 *  - Par employé   → /companies/assign (companies.edit + page.companies.assign)
 *  - Par compagnie → /employees/assign (employees.edit + page.employees.assign)
 * Les deux routes ouvrent cette page ; le mode vient de `data.mode` de la route.
 */
export const LINK_MODES: Record<LinkMode, { url: string; perm: string }> = {
  employee: { url: '/companies/assign', perm: PERM.companiesEdit },
  company:  { url: '/employees/assign', perm: PERM.employeesEdit },
};

/**
 * Page unique « Lier employés et compagnies » (fusion de « Assigner compagnies » et « Assigner employés »).
 * Le sélecteur de mode affiche le panneau correspondant ; les deux panneaux gardent leur logique et leurs appels d'API.
 */
@Component({
    selector: 'app-link-assign',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CompanyAssignComponent, EmployeeAssignComponent],
    templateUrl: './link-assign.component.html',
    styleUrls: ['./link-assign.component.scss']
})
export class LinkAssignComponent {
  private readonly auth       = inject(AuthService);
  private readonly router     = inject(Router);
  private readonly confirmDlg = inject(ConfirmService);

  readonly mode: LinkMode = inject(ActivatedRoute).snapshot.data['mode'] === 'company' ? 'company' : 'employee';

  /** Le sélecteur n'apparaît que si l'utilisateur peut ouvrir les deux modes (même règle que permGuard). */
  readonly canSwitch = computed(() => {
    this.auth.user();   // dépendance réactive
    return (Object.keys(LINK_MODES) as LinkMode[]).every(m => this.canOpenMode(m));
  });

  private readonly byEmployee = viewChild(CompanyAssignComponent);
  private readonly byCompany  = viewChild(EmployeeAssignComponent);

  private canOpenMode(m: LinkMode): boolean {
    const { url, perm } = LINK_MODES[m];
    return this.auth.hasPerm(perm) && this.auth.canOpen(url);
  }

  async setMode(m: LinkMode): Promise<void> {
    if (m === this.mode || !this.canOpenMode(m)) return;
    const panel = this.mode === 'employee' ? this.byEmployee() : this.byCompany();
    if (panel?.saving()) return;
    if (panel?.hasChanges() && !await this.confirmDlg.discard('Les liaisons non sauvegardées seront perdues.')) return;
    this.router.navigateByUrl(LINK_MODES[m].url);
  }
}
