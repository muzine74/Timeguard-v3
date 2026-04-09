import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { User, LoginRequest, LoginResponse } from '../../models';

const TOKEN_KEY = 'tg_token';
const USER_KEY  = 'tg_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<User | null>(this._stored());

  readonly user       = this._user.asReadonly();
  readonly loggedIn   = computed(() => !!this._user());

  private readonly _permSet = computed(() => new Set(this._user()?.permissions ?? []));

  hasPerm(key: string): boolean { return this._permSet().has(key); }

  // Accès aux pages de gestion (au moins une permission de gestion)
  readonly canManage = computed(() =>
    ['employees.view','companies.view','invoices.view','pointage.validate','groups.manage']
      .some(p => this._permSet().has(p))
  );
  // Accès à la feuille de temps uniquement
  readonly canPointage = computed(() => this._permSet().has('pointage.view'));

  readonly loggedInWithAccess = computed(() => this.loggedIn() && (this.canManage() || this.canPointage()));

  readonly employeeId = computed(() => this._user()?.employeeId ?? null);

  constructor(private http: HttpClient) {}

  login(req: LoginRequest) {
    return this.http.post<LoginResponse>('/api/auth/login', req).pipe(
      tap(res => {
        localStorage.setItem(TOKEN_KEY, res.token);

        // Décoder le JWT pour extraire employeeId si absent de la réponse
        const empId = res.employeeId ?? this._decodeEmployeeId(res.token);

        const u: User = {
          username:    res.username,
          permissions: res.permissions ?? [],
          employeeId:  empId,
        };
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        this._user.set(u);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._user.set(null);
  }

  token(): string | null { return localStorage.getItem(TOKEN_KEY); }

  // ── Décode le JWT et extrait employeeId ───────────────
  private _decodeEmployeeId(token: string): string {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      // Cherche les claims standards : sub, employeeId, nameid
      return decoded['employeeId']
          ?? decoded['sub']
          ?? decoded['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
          ?? '';
    } catch {
      return '';
    }
  }

  private _stored(): User | null {
    try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); }
    catch { return null; }
  }
}