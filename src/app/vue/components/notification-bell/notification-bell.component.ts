import { Component, ChangeDetectionStrategy, HostListener, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppNotification, NotificationKind, NotificationsService } from '../../../state/notifications/notifications.service';
import { IconComponent } from '../icon/icon.component';
import { dateTimeLabel } from '../../shared/dates';

const KIND_ICONS: Record<NotificationKind, string> = {
  invitation: 'calendar', update: 'edit', cancel: 'close', response: 'user-check', reminder: 'bell',
};

/** Cloche de la barre de navigation : notifications (invitations, réponses, rappels…) et bandeau des nouvelles. */
@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, IconComponent],
  template: `
    <div class="nb" [class.is-open]="open()">
      <button type="button" class="nb-btn" (click)="toggle($event)" aria-haspopup="true" [attr.aria-expanded]="open()"
              [attr.aria-label]="svc.unread() ? 'Notifications — ' + svc.unread() + ' non lue(s)' : 'Notifications'"
              title="Notifications">
        <app-icon name="bell"></app-icon>
        <span class="nb-count" *ngIf="svc.unread()" aria-hidden="true">{{ svc.unread() > 99 ? '99+' : svc.unread() }}</span>
      </button>

      <div class="nb-panel" *ngIf="open()" (click)="$event.stopPropagation()" role="dialog" aria-label="Notifications">
        <div class="nb-head">
          <b>Notifications</b>
          <button type="button" class="nb-link" *ngIf="svc.unread()" (click)="svc.markAllRead()">Tout marquer comme lu</button>
        </div>
        <div class="nb-empty" *ngIf="!svc.items().length && !svc.loading()">Aucune notification.</div>
        <div class="nb-empty" *ngIf="!svc.items().length && svc.loading()">Chargement…</div>
        <ul class="nb-list" *ngIf="svc.items().length">
          <li *ngFor="let n of svc.items(); trackBy: track">
            <button type="button" class="nb-item" [class.unread]="!n.read" (click)="openItem(n)">
              <span class="nb-ico" [attr.data-kind]="n.kind" aria-hidden="true"><app-icon [name]="icon(n)"></app-icon></span>
              <span class="nb-txt">
                <span class="nb-title">{{ n.title }}</span>
                <span class="nb-body" *ngIf="n.body">{{ n.body }}</span>
                <span class="nb-date">{{ when(n) }}</span>
              </span>
              <span class="nb-dot" *ngIf="!n.read" aria-label="Non lue"></span>
            </button>
          </li>
        </ul>
        <button type="button" class="nb-foot" (click)="go('/calendrier')">Ouvrir le calendrier</button>
      </div>
    </div>

    <!-- Bandeau des nouvelles notifications (rappels, invitations…) -->
    <div class="nb-toasts" *ngIf="svc.fresh().length" role="status" aria-live="polite">
      <div class="nb-toast" *ngFor="let n of svc.fresh().slice(0, 3); trackBy: track">
        <span class="nb-ico" [attr.data-kind]="n.kind" aria-hidden="true"><app-icon [name]="icon(n)"></app-icon></span>
        <button type="button" class="nb-toast-txt" (click)="openItem(n)">
          <span class="nb-title">{{ n.title }}</span>
          <span class="nb-body" *ngIf="n.body">{{ n.body }}</span>
        </button>
        <button type="button" class="nb-close" (click)="svc.dismissFresh()" aria-label="Fermer"><app-icon name="close"></app-icon></button>
      </div>
    </div>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .nb { position: relative; }
    .nb-btn {
      position: relative; display: inline-flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 8px; border: 1px solid transparent;
      background: transparent; color: var(--muted); cursor: pointer;
    }
    .nb-btn:hover, .is-open .nb-btn { color: var(--text); border-color: var(--border); }
    .nb-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .nb-count {
      position: absolute; top: 1px; right: 0; min-width: 17px; height: 17px; padding: 0 4px; box-sizing: border-box;
      border-radius: 9px; background: var(--danger); color: #fff; font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; line-height: 1;
    }
    .nb-panel {
      position: absolute; right: 0; top: calc(100% + 8px); z-index: 1200; width: 360px; max-width: calc(100vw - 24px);
      background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,.35); overflow: hidden;
    }
    .nb-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: .9rem; }
    .nb-link { background: none; border: none; color: var(--accent); font: inherit; font-size: .78rem; font-weight: 600; cursor: pointer; padding: 0; }
    .nb-link:hover { text-decoration: underline; }
    .nb-empty { padding: 20px 14px; font-size: .85rem; color: var(--muted); text-align: center; }
    .nb-list { list-style: none; margin: 0; padding: 0; max-height: 380px; overflow-y: auto; }
    .nb-item {
      display: flex; align-items: flex-start; gap: 10px; width: 100%; padding: 10px 14px; text-align: left;
      background: transparent; border: none; border-bottom: 1px solid var(--border); color: inherit; font: inherit; cursor: pointer;
    }
    .nb-item:hover { background: rgba(var(--overlay-rgb), .04); }
    .nb-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .nb-item.unread { background: rgba(var(--accent-rgb), .07); }
    .nb-ico {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
      background: rgba(var(--accent-rgb), .14); color: var(--accent); font-size: 14px;
    }
    .nb-ico[data-kind="cancel"]   { background: rgba(224, 82, 82, .14); color: var(--danger-text); }
    .nb-ico[data-kind="reminder"] { background: rgba(224, 154, 34, .16); color: var(--warning); }
    .nb-ico[data-kind="response"] { background: rgba(59, 170, 110, .15); color: var(--success-text); }
    .nb-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
    .nb-title { font-size: .84rem; font-weight: 600; word-break: break-word; }
    .nb-body { font-size: .78rem; color: var(--muted); word-break: break-word; }
    .nb-date { font-size: .7rem; color: var(--muted); }
    .nb-dot { flex-shrink: 0; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: var(--accent); }
    .nb-foot {
      display: block; width: 100%; padding: 10px 14px; background: transparent; border: none; color: var(--accent);
      font: inherit; font-size: .82rem; font-weight: 600; cursor: pointer; text-align: center;
    }
    .nb-foot:hover { background: rgba(var(--overlay-rgb), .04); }

    .nb-toasts {
      position: fixed; right: 16px; bottom: 16px; z-index: 1900; display: flex; flex-direction: column; gap: 8px;
      width: 340px; max-width: calc(100vw - 32px);
    }
    .nb-toast {
      display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 12px;
      background: var(--surface); color: var(--text); border: 1px solid rgba(var(--accent-rgb), .45);
      box-shadow: 0 10px 30px rgba(0,0,0,.4); animation: nb-in .2s ease-out;
    }
    .nb-toast-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; background: none; border: none; color: inherit; font: inherit; text-align: left; cursor: pointer; padding: 0; }
    .nb-close { background: none; border: none; color: var(--muted); cursor: pointer; padding: 2px; display: flex; }
    .nb-close:hover { color: var(--text); }
    @keyframes nb-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .nb-toast { animation: none; } }
  `],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  readonly svc = inject(NotificationsService);
  private readonly router = inject(Router);
  readonly open = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Les nouvelles notifications restent affichées 10 secondes
    effect(() => {
      if (!this.svc.fresh().length) return;
      if (this.toastTimer) clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.svc.dismissFresh(), 10_000);
    });
  }

  ngOnInit(): void { this.svc.start(); }
  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.svc.stop();
  }

  toggle(e: MouseEvent): void {
    e.stopPropagation();
    const next = !this.open();
    this.open.set(next);
    if (next) this.svc.load();
  }

  openItem(n: AppNotification): void {
    this.svc.markRead(n);
    this.svc.dismissFresh();
    this.go(n.link || '/calendrier');
  }

  go(link: string): void {
    this.open.set(false);
    this.router.navigateByUrl(link);
  }

  icon(n: AppNotification): string { return KIND_ICONS[n.kind] ?? 'bell'; }
  when(n: AppNotification): string { return dateTimeLabel(new Date(n.createdAt)); }
  track(_: number, n: AppNotification): string { return n.id; }

  @HostListener('document:click')
  close(): void { this.open.set(false); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.open.set(false); }
}
