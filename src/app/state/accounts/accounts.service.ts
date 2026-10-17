import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { LoginResponse } from '../../models';
import { AuthService } from '../auth/auth.service';

/** Un compte relié au compte connecté (le compte connecté lui-même compris : isCurrent). */
export interface LinkedAccount {
  credentialId: number;
  tenantSlug:   string;
  tenantName:   string;
  username:     string;
  isCurrent:    boolean;
  /** Faux si l'entreprise ou l'employé est désactivé, ou s'il faut relier de nouveau : bascule impossible. */
  available:    boolean;
  /** Le mot de passe de ce compte a changé depuis qu'il a été relié : il faut le relier de nouveau. */
  relinkNeeded: boolean;
}

export interface LinkAccountRequest {
  tenantSlug: string;
  username:   string;
  password:   string;
}

/**
 * « Mes entreprises » : comptes reliés dans plusieurs entreprises et bascule de l'une à l'autre.
 * La bascule ouvre une session ordinaire du compte de l'entreprise visée (ses droits, ses données) ;
 * la page est ensuite rechargée pour repartir sans aucune donnée de l'entreprise précédente en mémoire.
 */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _accounts = signal<LinkedAccount[]>([]);
  readonly accounts = this._accounts.asReadonly();
  /** Vrai dès qu'au moins un autre compte est relié. */
  readonly hasLinks = computed(() => this._accounts().length > 1);
  /** Autres comptes, vers lesquels on peut basculer. */
  readonly others   = computed(() => this._accounts().filter(a => !a.isCurrent));

  /** Recharge la liste (sans effet pour le super-administrateur ou un aperçu). */
  load(): void {
    if (!this.auth.loggedIn() || this.auth.isSuperUser() || this.auth.isImpersonating()) { this._accounts.set([]); return; }
    this.http.get<LinkedAccount[]>('/api/auth/accounts').subscribe({
      next:  list => this._accounts.set(list ?? []),
      error: ()   => this._accounts.set([]),     // table absente ou réseau : le sélecteur reste simplement caché
    });
  }

  clear(): void { this._accounts.set([]); }

  link(req: LinkAccountRequest): Observable<LinkedAccount[]> {
    return this.http.post<LinkedAccount[]>('/api/auth/accounts', req).pipe(tap(list => this._accounts.set(list)));
  }

  unlink(credentialId: number): Observable<LinkedAccount[]> {
    return this.http.delete<LinkedAccount[]>(`/api/auth/accounts/${credentialId}`).pipe(tap(list => this._accounts.set(list)));
  }

  /** Bascule vers un compte relié : nouvelle session, puis rechargement complet sur l'accueil. */
  switchTo(credentialId: number): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`/api/auth/accounts/${credentialId}/switch`, {}).pipe(tap(res => {
      this.auth.applySession(res);
      location.assign('/');
    }));
  }
}
