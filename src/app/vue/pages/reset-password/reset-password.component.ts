import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.scss'],
})
export class ResetPasswordComponent {
  password        = '';
  confirmPassword = '';
  showPw          = signal(false);
  loading         = signal(false);
  error           = signal('');
  success         = signal(false);

  private token = '';

  constructor(private route: ActivatedRoute, private auth: AuthService, private router: Router) {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) this.error.set('Lien invalide : jeton manquant.');
  }

  togglePw(): void { this.showPw.update(v => !v); }

  submit(): void {
    if (!this.token) return;
    if (this.password.length < 4) {
      this.error.set('Le mot de passe doit contenir au moins 4 caractères.'); return;
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

  goToLogin(): void { this.router.navigate(['/login']); }
}
