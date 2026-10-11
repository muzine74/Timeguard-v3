import { Component, signal, isDevMode, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { LangSwitchComponent } from '../../components/lang-switch/lang-switch.component';

@Component({
    selector: 'app-login',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink, LangSwitchComponent],
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  /** Paramètres de l'adresse : ?tenant=…&user=… (arrivée depuis le lien de réinitialisation du mot de passe). */
  private readonly _query = inject(ActivatedRoute).snapshot.queryParamMap;
  /** Identifiant pré-rempli quand on arrive depuis la réinitialisation du mot de passe. */
  username    = (this._query.get('user') ?? '').trim();
  password    = '';
  /** Identifiant d'entreprise : celui du lien de réinitialisation, sinon celui mémorisé sur cet appareil
   *  (non sensible) pour ne pas le ressaisir. */
  tenantSlug  = (this._query.get('tenant') ?? '').trim() || LoginComponent._lastTenant();
  /** Code de l'application d'authentification — champ affiché seulement quand le serveur le demande. */
  otp         = '';
  needOtp     = signal(false);
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

    if (this.needOtp() && !this.otp.trim()) {
      this.loading.set(false);
      this.error.set('Saisissez le code de vérification à 6 chiffres.'); return;
    }

    this.auth.login({
      username: this.username, password: this.password, tenantSlug: this.tenantSlug,
      ...(this.needOtp() ? { otp: this.otp.trim() } : {}),
    }).subscribe({
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

        // La racine choisit la page d'arrivée selon les permissions (homeGuard) : accueil pour un rôle
        // de gestion, feuille de temps ou liste des employés sinon.
        this.log('→ navigation vers la page de départ');
        this.router.navigate(['/']);
      },
      error: err => {
        this.loading.set(false);
        this.warn('✕ login échoué');
        this.warn('  status: ', err.status);
        this.warn('  message:', err.message);
        this.warn('  body:   ', err.error);
        // Second facteur demandé par le serveur : on affiche le champ du code, ce n'est pas une erreur
        if (err.status === 401 && err.error?.code === 'OTP_REQUIRED') {
          this.needOtp.set(true);
          this.otp = '';
          return;
        }
        if (err.status === 401 && err.error?.code === 'OTP_INVALID') {
          this.otp = '';
          this.error.set('Code de vérification incorrect ou déjà utilisé. Attendez le code suivant.');
          return;
        }
        this.error.set(
          err.status === 401 ? 'Identifiants incorrects.'
          // Compte temporairement verrouillé ou trop de tentatives : le serveur indique le délai
          : err.status === 429 ? (err.error?.message ?? 'Trop de tentatives. Réessayez dans quelques minutes.')
          : 'Erreur de connexion. Réessayez.'
        );
      }
    });
  }
}