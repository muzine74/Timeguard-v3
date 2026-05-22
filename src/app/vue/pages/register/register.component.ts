import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { RegisterTenantRequest } from '../../../models';

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss'],
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

    this.http.post('/api/tenants/register', this.form).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        setTimeout(() => this.router.navigate(['/login']), 3000);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
      },
    });
  }
}
