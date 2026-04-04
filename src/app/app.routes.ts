import { Routes } from '@angular/router';
import { adminGuard, userGuard, homeGuard } from './state/auth/auth.guard';

export const routes: Routes = [
  // Redirection par rôle : admin → /employees, user → /pointage, non connecté → /login
  {
    path: '',
    canActivate: [homeGuard],
    loadComponent: () => import('./vue/pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./vue/pages/login/login.component').then(m => m.LoginComponent)
  },

  // ── Pointage — USER uniquement ───────────────────────────────────────────
  {
    path: 'pointage',
    canActivate: [userGuard],
    loadComponent: () => import('./vue/pages/pointage/pointage.page').then(m => m.PointagePage)
  },

  // ── Employés — ADMIN uniquement ──────────────────────────────────────────
  {
    path: 'employees',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/employee-details/employee-details.component').then(m => m.EmployeeDetailsComponent)
  },
  {
    path: 'employees/new',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/employee-create/employee-create.component').then(m => m.EmployeeCreateComponent)
  },
  {
    path: 'employees/edit',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/employee-edit/employee-edit.component').then(m => m.EmployeeEditComponent)
  },
  {
    path: 'employees/assign',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/employee-assign/employee-assign.component').then(m => m.EmployeeAssignComponent)
  },
  {
    path: 'employees/:id',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/employee-details/employee-details.component').then(m => m.EmployeeDetailsComponent)
  },
  {
    path: 'employees/:id/edit',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/employee-edit/employee-edit.component').then(m => m.EmployeeEditComponent)
  },

  // ── Compagnies — ADMIN uniquement ────────────────────────────────────────
  {
    path: 'companies/new',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/company-form/company-form.component').then(m => m.CompanyFormComponent)
  },
  {
    path: 'companies/edit',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/Company-edit/Company-edit.component').then(m => m.CompanyEditComponent)
  },
  {
    path: 'companies/assign',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/company-assign/company-assign.component').then(m => m.CompanyAssignComponent)
  },
  {
    path: 'companies/:id/edit',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/Company-edit/Company-edit.component').then(m => m.CompanyEditComponent)
  },

  // ── Factures — ADMIN uniquement ──────────────────────────────────────────
  {
    path: 'invoices/new',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/invoice-generate/invoice-generate.component').then(m => m.InvoiceGenerateComponent)
  },
  {
    path: 'invoices',
    canActivate: [adminGuard],
    loadComponent: () => import('./vue/pages/invoice-manage/invoice-manage.component').then(m => m.InvoiceManageComponent)
  },

  { path: '**', loadComponent: () => import('./vue/pages/not-found/not-found.component').then(m => m.NotFoundComponent) }
];
