import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { User, LoginRequest, LoginResponse } from '../../models';
import { PAGES_ENABLED, pageKeyFor } from './page-permissions';

const TOKEN_KEY = 'tg_token';
const USER_KEY  = 'tg_user';

/**
 * Session PAR ONGLET : le jeton vit dans sessionStorage (propre à chaque onglet), pour que plusieurs comptes
 * puissent être ouverts dans des onglets différents du même navigateur sans s'écraser. localStorage ne garde
 * que la DERNIÈRE connexion, reprise par un onglet neuf (Ctrl + clic, nouvel onglet) pour ne pas imposer une
 * reconnexion à chaque fois ; ensuite, l'onglet vit sa vie. Stockage indisponible (navigation privée stricte) :
 * aucune erreur, la session reste simplement en mémoire.
 */
const tabStore = {
  get(k: string): string | null { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { sessionStorage.setItem(k, v); } catch { /* indisponible */ } },
  del(k: string): void { try { sessionStorage.removeItem(k); } catch { /* indisponible */ } },
};
const lastStore = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* indisponible */ } },
  del(k: string): void { try { localStorage.removeItem(k); } catch { /* indisponible */ } },
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<User | null>(this._stored());

  readonly user       = this._user.asReadonly();
  readonly loggedIn   = computed(() => !!this._user());

  private readonly _permSet = computed(() => new Set(this._user()?.permissions ?? []));

  hasPerm(key: string): boolean { return this._permSet().has(key); }

  /**
   * Droit de page : vrai si l'utilisateur peut ouvrir la page de cette adresse (voir page-permissions.ts).
   * Ne remplace pas le droit d'action de la page, il s'y ajoute. Le super-administrateur ouvre tout.
   */
  canOpen(url: string): boolean {
    if (this.isSuperUser() || !this._permSet().has(PAGES_ENABLED)) return true;
    const key = pageKeyFor(url);
    return key === null || this._permSet().has(key);
  }

  readonly canManage = computed(() =>
    ['employees.view','companies.view','invoices.view','pointage.validate','groups.manage']
      .some(p => this._permSet().has(p))
  );
  readonly canPointage = computed(() => this._permSet().has('pointage.view'));
  readonly canValidatePointage = computed(() => this._permSet().has('pointage.validate'));
  readonly loggedInWithAccess = computed(() => this.loggedIn() && (this.canManage() || this.canPointage()));
  readonly employeeId  = computed(() => this._user()?.employeeId  ?? null);
  readonly tenantId    = computed(() => this._user()?.tenantId    ?? null);
  readonly tenantSlug  = computed(() => this._user()?.tenantSlug  ?? null);
  readonly isSuperUser = computed(() => this._user()?.isSuperUser ?? false);

  private _superSession = signal<{ token: string; user: User } | null>(null);
  readonly isImpersonating = computed(() => !!this._superSession());

  impersonateAs(res: LoginResponse): void {
    const snap = { token: this.token()!, user: this._user()! };
    this._superSession.set(snap);
    const u: User = {
      username:    res.username,
      permissions: res.permissions ?? [],
      employeeId:  res.employeeId,
      tenantId:    res.tenantId    ?? '',
      tenantSlug:  res.tenantSlug  ?? '',
      isSuperUser: false,
    };
    // Aperçu : cet onglet seulement (un onglet neuf ne doit pas s'ouvrir dans l'aperçu)
    this._save(res.token, u, false);
  }

  restoreSession(): void {
    const s = this._superSession();
    if (!s) return;
    this._save(s.token, s.user, false);
    this._superSession.set(null);
  }

  constructor(private http: HttpClient) {}

  login(req: LoginRequest) {
    return this.http.post<LoginResponse>('/api/auth/login', req).pipe(tap(res => this.applySession(res)));
  }

  /** Enregistre une session reçue de l'API : connexion, ou bascule vers un compte relié (« Mes entreprises »). */
  applySession(res: LoginResponse): void {
    const empId = res.employeeId ?? this._decodeEmployeeId(res.token);

    const u: User = {
      username:    res.username,
      permissions: res.permissions ?? [],
      employeeId:  empId,
      tenantId:    res.tenantId    ?? '',
      tenantSlug:  res.tenantSlug  ?? '',
      isSuperUser: res.isSuperUser ?? false,
    };
    this._save(res.token, u, true);
  }

  /** Déconnecte CET onglet. La « dernière connexion » proposée aux onglets neufs n'est oubliée que si c'était
   *  la même session ; les autres onglets gardent leur session. */
  logout(): void {
    const mine = tabStore.get(TOKEN_KEY);
    tabStore.del(TOKEN_KEY);
    tabStore.del(USER_KEY);
    if (mine && lastStore.get(TOKEN_KEY) === mine) { lastStore.del(TOKEN_KEY); lastStore.del(USER_KEY); }
    this._token = null;
    this._user.set(null);
  }

  token(): string | null { return this._token; }

  /** Jeton de cet onglet (gardé aussi en mémoire si le stockage du navigateur est indisponible). */
  private _token: string | null = tabStore.get(TOKEN_KEY);

  /** Enregistre la session de cet onglet ; asLast = la proposer aussi aux onglets ouverts ensuite. */
  private _save(token: string, u: User, asLast: boolean): void {
    this._token = token;
    tabStore.set(TOKEN_KEY, token);
    tabStore.set(USER_KEY, JSON.stringify(u));
    if (asLast) { lastStore.set(TOKEN_KEY, token); lastStore.set(USER_KEY, JSON.stringify(u)); }
    this._user.set(u);
  }

  /** Applique un nouveau mot de passe à partir d'un jeton reçu par courriel (page publique). */
  /** Entreprise et identifiant du compte visé par un lien de réinitialisation (le lien n'est pas consommé). */
  resetPasswordInfo(token: string) {
    return this.http.post<{ companyName: string; companySlug: string; username: string }>('/api/auth/reset-password/info', { token });
  }

  resetPasswordByToken(token: string, newPassword: string) {
    return this.http.post<{ message: string }>('/api/auth/reset-password', { token, newPassword });
  }

  private _decodeEmployeeId(token: string): string {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded['employeeId'] ?? decoded['sub'] ?? '';
    } catch {
      return '';
    }
  }

  /** Session de l'onglet ; un onglet neuf (rien dans sessionStorage) reprend la dernière connexion. */
  private _stored(): User | null {
    if (!tabStore.get(TOKEN_KEY)) {
      const t = lastStore.get(TOKEN_KEY), u = lastStore.get(USER_KEY);
      if (t && u) { tabStore.set(TOKEN_KEY, t); tabStore.set(USER_KEY, u); }
    }
    try { return JSON.parse(tabStore.get(USER_KEY) ?? 'null'); }
    catch { return null; }
  }
}
