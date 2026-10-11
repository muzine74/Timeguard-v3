import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { RegisterTenantRequest } from '../../../models';
import { httpErrorMessage } from '../../shared/http-error';

@Component({
    selector: 'app-register',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.scss']
})
export class RegisterComponent {
  form: RegisterTenantRequest = {
    companyName:   '',
    slug:          '',
    ownerEmail:    '',
    adminUsername: '',
    adminPassword: '',
    plan:          'starter',
  };

  loading = signal(false);
  error   = signal('');
  success = signal(false);
  /** L'espace est créé mais reste inactif jusqu'à sa validation par l'administrateur de la plateforme. */
  pending = signal(false);

  constructor(private http: HttpClient, private router: Router) {}

  /** Génère un slug depuis le nom de l'entreprise. */
  onNameChange(): void {
    if (!this.form.slug) {
      this.form.slug = this.form.companyName
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
  }

  submit(): void {
    const { companyName, slug, ownerEmail, adminUsername, adminPassword } = this.form;
    if (!companyName || !slug || !ownerEmail || !adminUsername || !adminPassword) {
      this.error.set('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (!/^[a-z0-9\-]+$/.test(slug)) {
      this.error.set('Identifiant : lettres minuscules, chiffres et tirets uniquement.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    if (adminPassword.length < 10) {
      this.loading.set(false);
      this.error.set('Le mot de passe doit contenir au moins 10 caractères.');
      return;
    }

    this.http.post<{ isActive?: boolean }>('/api/tenants/register', this.form).subscribe({
      next: res => {
        this.loading.set(false);
        this.pending.set(res?.isActive === false);
        this.success.set(true);
        // Espace en attente de validation : pas de redirection, la connexion serait refusée
        if (!this.pending()) setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: err => {
        this.loading.set(false);
        const validationErrors = err?.error?.errors;
        const firstValidationMsg = validationErrors
          ? (Object.values(validationErrors)[0] as string[] | undefined)?.[0]
          : undefined;
        this.error.set(err?.error?.message ?? firstValidationMsg ?? httpErrorMessage(err));
      },
    });
  }
}
