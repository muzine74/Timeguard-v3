import { Component, signal, isDevMode, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username    = '';
  password    = '';
  /** Identifiant d'entreprise mémorisé sur cet appareil (non sensible) pour ne pas le ressaisir. */
  tenantSlug  = LoginComponent._lastTenant();
  showPw      = signal(false);
  loading     = signal(false);
  error       = signal('');

  private get _dev(): boolean { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[LoginComponent]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[LoginComponent]', ...a); }

  constructor(private auth: AuthService, private router: Router, private route: ActivatedRoute) {}

  /** Arrivée après une session expirée (401) : message explicatif. */
  readonly sessionExpired = inject(ActivatedRoute).snapshot.queryParamMap.get('expired') === '1';

  private static _lastTenant(): string {
    try { return localStorage.getItem('tg_last_tenant') ?? ''; } catch { return ''; }
  }

  /** Page à rouvrir après connexion : chemin interne uniquement (pas de redirection ouverte). */
  private _returnUrl(): string | null {
    const u = this.route.snapshot.queryParamMap.get('returnUrl');
    if (!u || !u.startsWith('/') || u.startsWith('//') || u.startsWith('/\\') || u.startsWith('/login')) return null;
    return u;
  }

  togglePw(): void { this.showPw.update(v => !v); }

  submit(): void {
    if (!this.tenantSlug || !this.username || !this.password) {
      this.error.set('Veuillez remplir tous les champs.'); return;
    }

    this.log(`submit() → POST /api/auth/login { username: "${this.username}" }`);
    this.loading.set(true);
    this.error.set('');

    this.auth.login({ username: this.username, password: this.password, tenantSlug: this.tenantSlug }).subscribe({
      next: () => {
        this.loading.set(false);
        this.log('✓ login réussi');
        try { localStorage.setItem('tg_last_tenant', this.tenantSlug.trim()); } catch { /* stockage indisponible */ }
        this.log('  user:       ', this.auth.user());
        this.log('  employeeId: ', this.auth.employeeId());
        this.log('  permissions:', this.auth.user()?.permissions);
        this.log('  token JWT:  ', localStorage.getItem('tg_token'));

        // Super user : panneau providers dédié
        if (this.auth.isSuperUser()) {
          this.router.navigate(['/providers']);
          return;
        }

        if (!this.auth.loggedInWithAccess()) {
          this.warn('✕ aucune permission assignée');
          this.auth.logout();
          this.error.set('Aucune permission assignée. Contactez un administrateur.');
          return;
        }

        const back = this._returnUrl();
        if (back) { this.router.navigateByUrl(back); return; }   // les gardes vérifient encore la permission

        const dest = this.auth.canManage() ? '/employees' : '/pointage';
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