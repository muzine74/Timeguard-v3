import { Component, signal, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username = 'user2';
  password = 'user222';
  showPw   = signal(false);
  loading  = signal(false);
  error    = signal('');

  private get _dev(): boolean { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[LoginComponent]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[LoginComponent]', ...a); }

  constructor(private auth: AuthService, private router: Router) {}

  togglePw(): void { this.showPw.update(v => !v); }

  submit(): void {
    if (!this.username || !this.password) {
      this.error.set('Veuillez remplir tous les champs.'); return;
    }

    this.log(`submit() → POST /api/auth/login { username: "${this.username}" }`);
    this.loading.set(true);
    this.error.set('');

    this.auth.login({ username: this.username, password: this.password }).subscribe({
      next: () => {
        this.loading.set(false);
        this.log('✓ login réussi');
        this.log('  user:       ', this.auth.user());
        this.log('  employeeId: ', this.auth.employeeId());
        this.log('  role:       ', this.auth.user()?.role);
        this.log('  token JWT:  ', localStorage.getItem('tg_token'));
        const dest = this.auth.isAdmin() ? '/employees' : '/pointage';
        this.log(`→ navigation vers ${dest}`);
        this.router.navigate([dest]);
      },
      error: err => {
        this.loading.set(false);
        this.warn('✕ login échoué');
        this.warn('  status: ', err.status);
        this.warn('  message:', err.message);
        this.warn('  body:   ', err.error);
        this.error.set(
          err.status === 401
            ? 'Identifiants incorrects.'
            : 'Erreur de connexion. Réessayez.'
        );
      }
    });
  }
}