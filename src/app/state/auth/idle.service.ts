import { Injectable, NgZone, effect, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ConfigService } from '../config/config.service';

/** Événements qui comptent comme activité de l'utilisateur dans l'onglet. */
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll', 'mousemove'];

/**
 * Délai d'inactivité (Configuration → Sécurité) : si l'onglet reste sans activité de l'utilisateur pendant ce
 * délai, sa session est fermée et il faut se reconnecter. L'API applique le même délai (refus 401
 * « IDLE_TIMEOUT ») : ce service le rend visible tout de suite et la prévient quand l'utilisateur travaille
 * sans l'appeler (saisie longue), pour qu'elle ne ferme pas une session active. Chaque onglet a sa session
 * (voir AuthService), donc son propre suivi.
 */
@Injectable({ providedIn: 'root' })
export class IdleService {
  private readonly auth   = inject(AuthService);
  private readonly config = inject(ConfigService);
  private readonly http   = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly zone   = inject(NgZone);

  private lastActivity = Date.now();
  private lastPing     = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private timeoutMs = 0;

  private readonly onActivity = () => {
    this.lastActivity = Date.now();
    // Signal à l'API au plus toutes les 2 minutes (et au moins 3 fois par délai)
    const every = Math.min(120_000, this.timeoutMs / 3);
    if (Date.now() - this.lastPing > every) {
      this.lastPing = Date.now();
      this.http.post('/api/auth/activity', {}).subscribe({ error: () => { /* 401 géré par l'intercepteur */ } });
    }
  };
  private readonly onVisible = () => { if (document.visibilityState === 'visible') this.check(); };

  constructor() {
    // Démarre / arrête selon la connexion et le réglage de l'entreprise (relu à la connexion et à l'enregistrement)
    effect(() => {
      const minutes = this.config.idleTimeoutMinutes();
      const active  = this.auth.loggedIn() && !this.auth.isSuperUser() && minutes > 0;
      if (active) this.start(minutes); else this.stop();
    });
  }

  private start(minutes: number): void {
    this.timeoutMs = minutes * 60_000;
    if (this.timer) return;
    this.lastActivity = Date.now();
    this.lastPing     = Date.now();
    // Hors de la zone Angular : les mouvements de souris ne déclenchent pas de détection de changements
    this.zone.runOutsideAngular(() => {
      ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, this.onActivity, { passive: true, capture: true }));
      this.timer = setInterval(() => this.check(), 15_000);
    });
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, this.onActivity, { capture: true }));
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** Délai dépassé : fermeture de la session de CET onglet, puis connexion (retour à la page ensuite). */
  private check(): void {
    if (!this.timer || Date.now() - this.lastActivity < this.timeoutMs) return;
    this.zone.run(() => {
      const here = this.router.url;
      this.stop();
      this.auth.logout();
      this.router.navigate(['/login'], { queryParams: { expired: 'idle', ...(here && !here.startsWith('/login') ? { returnUrl: here } : {}) } });
    });
  }
}
