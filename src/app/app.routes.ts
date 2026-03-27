import { Routes } from '@angular/router';
import { authGuard } from './state/auth/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'employees', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./vue/pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'employees',
    canActivate: [authGuard],
    loadComponent: () => import('./vue/pages/employee-details/employee-details.component').then(m => m.EmployeeDetailsComponent)
  },
  {
    path: 'employees/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./vue/pages/employee-details/employee-details.component').then(m => m.EmployeeDetailsComponent)
  },
  {
    path: 'pointage',
    canActivate: [authGuard],
    loadComponent: () => import('./vue/pages/pointage/pointage.page').then(m => m.PointagePage)
  },
  {
    path: 'newcompanies',
    canActivate: [authGuard],
    loadComponent: () => import('./vue/pages/company-form/company-form.component').then(m => m.CompanyFormComponent)
  },
  {
    path: '**',
    loadComponent: () => import('./vue/pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];
