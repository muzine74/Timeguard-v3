import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
    selector: 'app-reset-password',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './reset-password.component.html',
    styleUrls: ['./reset-password.component.scss']
})
export class ResetPasswordComponent {
  password        = '';
  confirmPassword = '';
  showPw          = signal(false);
  loading         = signal(false);
  error           = signal('');
  success         = signal(false);
  /** Compte visé par le lien (entreprise + identifiant), chargé à l'ouverture de la page. */
  account         = signal<{ companyName: string; companySlug: string; username: string } | null>(null);
  checking        = signal(true);
  linkInvalid     = signal(false);

  private token = '';

  constructor(private route: ActivatedRoute, private auth: AuthService, private router: Router) {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.error.set('Lien invalide : jeton manquant.');
      this.linkInvalid.set(true);
      this.checking.set(false);
      return;
    }
    this.auth.resetPasswordInfo(this.token).subscribe({
      next: info => { this.account.set(info); this.checking.set(false); },
      error: err => {
        this.linkInvalid.set(true);
        this.checking.set(false);
        this.error.set(err?.error?.message ?? 'Ce lien de réinitialisation est invalide ou a expiré.');
      },
    });
  }

  togglePw(): void { this.showPw.update(v => !v); }

  submit(): void {
    if (!this.token) return;
    if (this.password.length < 10) {
      this.error.set('Le mot de passe doit contenir au moins 10 caractères.'); return;
    }
    if (this.password !== this.confirmPassword) {
      this.error.set('Les mots de passe ne correspondent pas.'); return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.resetPasswordByToken(this.token, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Erreur lors de la mise à jour du mot de passe.');
      },
    });
  }

  /** Vers la connexion, avec l'identifiant d'entreprise ET l'identifiant utilisateur pré-remplis
   *  (il ne reste que le mot de passe à saisir). Passés dans l'adresse : ils fonctionnent même si le
   *  stockage du navigateur est indisponible. */
  goToLogin(): void {
    const a = this.account();
    if (a?.companySlug) { try { localStorage.setItem('tg_last_tenant', a.companySlug); } catch { /* stockage indisponible */ } }
    const queryParams: Record<string, string> = {};
    if (a?.companySlug) queryParams['tenant'] = a.companySlug;
    if (a?.username)    queryParams['user']   = a.username;
    this.router.navigate(['/login'], { queryParams });
  }
}
