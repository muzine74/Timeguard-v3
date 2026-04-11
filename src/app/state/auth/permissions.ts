export const PERM = {
  employeesView:      'employees.view',
  employeesCreate:    'employees.create',
  employeesEdit:      'employees.edit',
  pointageView:       'pointage.view',
  pointageValidate:   'pointage.validate',
  invoicesView:       'invoices.view',
  invoicesEdit:       'invoices.edit',
  invoicesSend:       'invoices.send',
  companiesEdit:      'companies.edit',
  groupsManage:       'groups.manage',
  configManage:       'config.manage',
  credentialsManage:  'credentials.manage',
} as const;

export type PermKey = typeof PERM[keyof typeof PERM];
