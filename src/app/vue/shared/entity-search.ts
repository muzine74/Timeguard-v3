import { Employee } from '../../models';
import { ExportDoc } from '../../state/export/table-export.service';
import { listExportDoc, kw } from './multi-search';

/**
 * Champs de la recherche multicritères (« & » / « | ») et colonnes d'export communs aux listes d'employés.
 * « dupont & montréal & actif » trouve les employés actifs nommés Dupont habitant Montréal.
 */
export function employeeSearchFields(e: Partial<Employee>): unknown[] {
  return [e.employeeName, e.employeeMail, e.employeePhone, e.employeeType, e.modeRemuneration,
          e.employeeCity, e.managerName, e.isTeamLead ? "chef d'équipe" : '', kw(e.isActive === false ? 'inactif' : 'actif')];
}

export function employeesExportDoc(rows: Partial<Employee>[], opts: { name: string; title: string; search?: string | null; extra?: string }): ExportDoc {
  return listExportDoc({
    ...opts,
    columns: [{ header: 'Employé', width: 30 }, { header: 'Courriel', width: 30 }, { header: 'Téléphone', width: 16 },
              { header: 'Type', width: 14 }, { header: 'Ville', width: 18 }, { header: 'Chef / responsable', width: 24 }, { header: 'État', width: 10 }],
    rows: rows.map(e => [e.employeeName ?? '', e.employeeMail ?? '', e.employeePhone ?? '', e.employeeType ?? '',
                         e.employeeCity ?? '', e.managerName ?? '', e.isActive === false ? 'Inactif' : 'Actif']),
    landscape: true,
  });
}

/** Compagnies (liste simple) : nom + état, avec une colonne facultative (ex. « Assignée »). */
export function companiesExportDoc<T extends { companyName: string; isActive?: boolean }>(
  rows: T[], opts: { name: string; title: string; search?: string | null; extra?: string },
  flag?: { header: string; value: (r: T) => string }): ExportDoc {
  return listExportDoc({
    ...opts,
    columns: [{ header: 'Compagnie', width: 40 }, { header: 'État', width: 10 }, ...(flag ? [{ header: flag.header, width: 14 }] : [])],
    rows: rows.map(c => [c.companyName, c.isActive === false ? 'Inactive' : 'Active', ...(flag ? [flag.value(c)] : [])]),
  });
}
