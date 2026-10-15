import { Injectable, NgZone, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

/** invitation · update (modifié) · cancel (annulé) · response (réponse à une invitation) · reminder (rappel). */
export type NotificationKind = 'invitation' | 'update' | 'cancel' | 'response' | 'reminder';

export interface AppNotification {
  id:        string;
  kind:      NotificationKind;
  title:     string;
  body:      string | null;
  /** Page à ouvrir dans TimeGuard (ex. « /calendrier?event=… »). */
  link:      string | null;
  eventId:   string | null;
  createdAt: string;
  read:      boolean;
}

/** Délai entre deux vérifications du nombre de notifications non lues. */
const POLL_MS = 60_000;

/**
 * Notifications de la cloche (barre de navigation). Le nombre de non lues est relu toutes les minutes tant que
 * l'onglet est affiché, et au retour sur l'onglet ; la liste se charge à l'ouverture de la cloche.
 * `fresh` reçoit les notifications arrivées depuis la vérification précédente (rappels affichés en bandeau).
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService implements OnDestroy {
  readonly unread  = signal(0);
  readonly items   = signal<AppNotification[]>([]);
  readonly loading = signal(false);
  readonly fresh   = signal<AppNotification[]>([]);

  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Set<string>();
  private primed = false;
  private readonly onVisible = () => { if (document.visibilityState === 'visible') this.poll(); };

  constructor(private http: HttpClient, private zone: NgZone) {}

  /** Démarre la vérification périodique (à la connexion). */
  start(): void {
    if (this.timer) return;
    this.poll();
    // Hors de la zone Angular : le minuteur ne déclenche pas de détection de changements à vide
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.zone.run(() => this.poll()); }, POLL_MS);
    });
    document.addEventListener('visibilitychange', this.onVisible);
  }

  /** Arrête tout et oublie les notifications (déconnexion). */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    this.unread.set(0); this.items.set([]); this.fresh.set([]);
    this.seen.clear(); this.primed = false;
  }

  ngOnDestroy(): void { this.stop(); }

  /** Relit le nombre de non lues ; s'il augmente, recharge la liste pour signaler les nouvelles. */
  poll(): void {
    this.http.get<{ unread: number }>('/api/notifications/unread-count').subscribe({
      next: r => {
        const before = this.unread();
        this.unread.set(r.unread);
        if (!this.primed || r.unread > before) this.load();
      },
      error: () => { /* silencieux : la cloche ne doit jamais gêner le travail */ },
    });
  }

  load(): void {
    this.loading.set(true);
    this.http.get<{ items: AppNotification[]; unread: number }>('/api/notifications', { params: { take: 30 } }).subscribe({
      next: r => {
        this.items.set(r.items);
        this.unread.set(r.unread);
        // Première lecture : rien n'est « nouveau ». Ensuite, les non lues jamais vues sont signalées.
        const fresh = this.primed ? r.items.filter(n => !n.read && !this.seen.has(n.id)) : [];
        r.items.forEach(n => this.seen.add(n.id));
        this.primed = true;
        if (fresh.length) this.fresh.set(fresh);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  markRead(n: AppNotification): void {
    if (n.read) return;
    this.items.update(list => list.map(x => x.id === n.id ? { ...x, read: true } : x));
    this.unread.update(v => Math.max(0, v - 1));
    this.http.post(`/api/notifications/${n.id}/read`, {}).subscribe({ error: () => this.poll() });
  }

  markAllRead(): void {
    this.items.update(list => list.map(x => ({ ...x, read: true })));
    this.unread.set(0);
    this.http.post('/api/notifications/read-all', {}).subscribe({ error: () => this.poll() });
  }

  dismissFresh(): void { this.fresh.set([]); }
}
