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

  readonly canManage = computed(() =>
    ['employees.view','companies.view','invoices.view','pointage.validate','groups.manage']
      .some(p => this._permSet().has(p))
  );
  readonly canPointage = computed(() => this._permSet().has('pointage.view'));
  readonly loggedInWithAccess = computed(() => this.loggedIn() && (this.canManage() || this.canPointage()));
  readonly employeeId  = computed(() => this._user()?.employeeId  ?? null);
  readonly tenantId    = computed(() => this._user()?.tenantId    ?? null);
  readonly tenantSlug  = computed(() => this._user()?.tenantSlug  ?? null);
  readonly isSuperUser = computed(() => this._user()?.isSuperUser ?? false);

  private _superSession = signal<{ token: string; user: User } | null>(null);
  readonly isImpersonating = computed(() => !!this._superSession());

  impersonateAs(res: LoginResponse): void {
    const snap = { token: localStorage.getItem('tg_token')!, user: this._user()! };
    this._superSession.set(snap);
    const u: User = {
      username:    res.username,
      permissions: res.permissions ?? [],
      employeeId:  res.employeeId,
      tenantId:    res.tenantId    ?? '',
      tenantSlug:  res.tenantSlug  ?? '',
      isSuperUser: false,
    };
    localStorage.setItem('tg_token', res.token);
    localStorage.setItem('tg_user',  JSON.stringify(u));
    this._user.set(u);
  }

  restoreSession(): void {
    const s = this._superSession();
    if (!s) return;
    localStorage.setItem('tg_token', s.token);
    localStorage.setItem('tg_user',  JSON.stringify(s.user));
    this._user.set(s.user);
    this._superSession.set(null);
  }

  constructor(private http: HttpClient) {}

  login(req: LoginRequest) {
    return this.http.post<LoginResponse>('/api/auth/login', req).pipe(
      tap(res => {
        localStorage.setItem(TOKEN_KEY, res.token);

        const empId = res.employeeId ?? this._decodeEmployeeId(res.token);

        const u: User = {
          username:    res.username,
          permissions: res.permissions ?? [],
          employeeId:  empId,
          tenantId:    res.tenantId    ?? '',
          tenantSlug:  res.tenantSlug  ?? '',
          isSuperUser: res.isSuperUser ?? false,
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

  private _decodeEmployeeId(token: string): string {
    try {
      const payload = token.split('.')[1];
      const decoded = JSON.parse(atob(payload));
      return decoded['employeeId'] ?? decoded['sub'] ?? '';
    } catch {
      return '';
    }
  }

  private _stored(): User | null {
    try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); }
    catch { return null; }
  }
}
