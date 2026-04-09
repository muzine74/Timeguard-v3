import { Routes } from '@angular/router';
import { permGuard, homeGuard } from './state/auth/auth.guard';

export const routes: Routes = [
  // Redirection par permission
  {
    path: '',
    canActivate: [homeGuard],
    loadComponent: () => import('./vue/pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./vue/pages/login/login.component').then(m => m.LoginComponent)
  },

  // ── Pointage ─────────────────────────────────────────────────────────────
  {
    path: 'pointage',
    canActivate: [permGuard('pointage.view')],
    loadComponent: () => import('./vue/pages/pointage/pointage.page').then(m => m.PointagePage)
  },

  // ── Employés ─────────────────────────────────────────────────────────────
  {
    path: 'employees',
    canActivate: [permGuard('employees.view')],
    loadComponent: () => import('./vue/pages/employee-details/employee-details.component').then(m => m.EmployeeDetailsComponent)
  },
  {
    path: 'employees/validation',
    canActivate: [permGuard('pointage.validate')],
    loadComponent: () => import('./vue/pages/employee-validation/employee-validation.component').then(m => m.EmployeeValidationComponent)
  },
  {
    path: 'employees/new',
    canActivate: [permGuard('employees.create')],
    loadComponent: () => import('./vue/pages/employee-create/employee-create.component').then(m => m.EmployeeCreateComponent)
  },
  {
    path: 'employees/edit',
    canActivate: [permGuard('employees.edit')],
    loadComponent: () => import('./vue/pages/employee-edit/employee-edit.component').then(m => m.EmployeeEditComponent)
  },
  {
    path: 'employees/assign',
    canActivate: [permGuard('employees.edit')],
    loadComponent: () => import('./vue/pages/employee-assign/employee-assign.component').then(m => m.EmployeeAssignComponent)
  },
  {
    path: 'employees/pricing',
    canActivate: [permGuard('employees.edit')],
    loadComponent: () => import('./vue/pages/employee-pricing/employee-pricing.component').then(m => m.EmployeePricingComponent)
  },
  {
    path: 'employees/credentials',
    canActivate: [permGuard('employees.edit')],
    loadComponent: () => import('./vue/pages/employee-credentials/employee-credentials.component').then(m => m.EmployeeCredentialsComponent)
  },
  {
    path: 'employees/:id',
    canActivate: [permGuard('employees.view')],
    loadComponent: () => import('./vue/pages/employee-details/employee-details.component').then(m => m.EmployeeDetailsComponent)
  },
  {
    path: 'employees/:id/edit',
    canActivate: [permGuard('employees.edit')],
    loadComponent: () => import('./vue/pages/employee-edit/employee-edit.component').then(m => m.EmployeeEditComponent)
  },

  // ── Compagnies ────────────────────────────────────────────────────────────
  {
    path: 'companies/new',
    canActivate: [permGuard('companies.edit')],
    loadComponent: () => import('./vue/pages/company-form/company-form.component').then(m => m.CompanyFormComponent)
  },
  {
    path: 'companies/edit',
    canActivate: [permGuard('companies.edit')],
    loadComponent: () => import('./vue/pages/Company-edit/Company-edit.component').then(m => m.CompanyEditComponent)
  },
  {
    path: 'companies/assign',
    canActivate: [permGuard('companies.edit')],
    loadComponent: () => import('./vue/pages/company-assign/company-assign.component').then(m => m.CompanyAssignComponent)
  },
  {
    path: 'companies/:id/edit',
    canActivate: [permGuard('companies.edit')],
    loadComponent: () => import('./vue/pages/Company-edit/Company-edit.component').then(m => m.CompanyEditComponent)
  },

  // ── Factures ─────────────────────────────────────────────────────────────
  {
    path: 'invoices',
    canActivate: [permGuard('invoices.view')],
    loadComponent: () => import('./vue/pages/invoice-manage/invoice-manage.component').then(m => m.InvoiceManageComponent)
  },
  {
    path: 'invoices/new',
    canActivate: [permGuard('invoices.edit')],
    loadComponent: () => import('./vue/pages/invoice-generate/invoice-generate.component').then(m => m.InvoiceGenerateComponent)
  },
  {
    path: 'invoices/from-timesheets',
    canActivate: [permGuard('invoices.edit')],
    loadComponent: () => import('./vue/pages/invoice-from-timesheets/invoice-from-timesheets.component').then(m => m.InvoiceFromTimesheetsComponent)
  },

  // ── Groupes & accès ───────────────────────────────────────────────────────
  {
    path: 'groups',
    canActivate: [permGuard('groups.manage')],
    loadComponent: () => import('./vue/pages/groups-manage/groups-manage.component').then(m => m.GroupsManageComponent)
  },

  // ── Configuration ─────────────────────────────────────────────────────────
  {
    path: 'config',
    canActivate: [permGuard('config.manage')],
    loadComponent: () => import('./vue/pages/app-config/app-config.component').then(m => m.AppConfigComponent)
  },

  { path: '**', loadComponent: () => import('./vue/pages/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
