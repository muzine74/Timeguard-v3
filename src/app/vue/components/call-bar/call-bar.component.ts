import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TelephonyService } from '../../../state/telephony/telephony.service';

/** Barre d'appel : visible sur toutes les pages tant qu'un appel est en cours (ou vient de se terminer). */
@Component({
    selector: 'app-call-bar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
    <div class="call-bar" *ngIf="tel.call() as c" [class.call-ended]="c.state === 'ended'" [class.call-error]="c.error"
         role="region" aria-label="Appel en cours">
      <div class="call-main">
        <span class="call-icon" aria-hidden="true">📞</span>
        <div class="call-info">
          <div class="call-label">{{ c.label }}</div>
          <div class="call-state" role="status" aria-live="polite">
            <ng-container *ngIf="!c.error">{{ stateLabel() }}</ng-container>
            <span class="call-rec" *ngIf="c.state === 'open' && tel.status()?.recording">● Enregistré</span>
          </div>
        </div>
        <div class="call-actions" *ngIf="c.state !== 'ended'">
          <button type="button" class="btn btn-outline" [attr.aria-pressed]="c.muted" [disabled]="c.state !== 'open'" (click)="tel.toggleMute()">
            {{ c.muted ? 'Réactiver le micro' : 'Muet' }}
          </button>
          <button type="button" class="btn btn-outline" [attr.aria-expanded]="keypad()" [disabled]="c.state !== 'open'" (click)="keypad.set(!keypad())">Clavier</button>
          <button type="button" class="btn btn-danger call-hangup" (click)="tel.hangUp()">Raccrocher</button>
        </div>
        <button type="button" class="btn btn-outline" *ngIf="c.state === 'ended'" (click)="tel.dismiss()">Fermer</button>
      </div>
      <div class="call-error-txt" role="alert" *ngIf="c.error">⚠ {{ c.error }}</div>
      <div class="call-keypad" *ngIf="keypad() && c.state === 'open'" aria-label="Clavier téléphonique">
        <button type="button" *ngFor="let d of DIGITS" (click)="tel.sendDigit(d)">{{ d }}</button>
      </div>
    </div>
  `,
    styles: [`
    .call-bar {
      position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 900;
      width: min(560px, calc(100vw - 24px)); padding: 12px 14px; border-radius: 14px;
      background: var(--surface); border: 1px solid rgba(var(--accent-rgb), .45);
      box-shadow: 0 10px 30px rgba(0, 0, 0, .35);
    }
    .call-bar.call-ended { border-color: var(--border); }
    .call-bar.call-error { border-color: var(--danger); }
    .call-main { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .call-icon { font-size: 20px; }
    .call-info { flex: 1 1 160px; min-width: 0; }
    .call-label { font-size: 14px; font-weight: 700; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .call-state { font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .call-rec { color: var(--danger); font-weight: 600; }
    .call-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .call-actions .btn { font-size: 12px; padding: 7px 12px; }
    .call-hangup { font-weight: 700; }
    .call-error-txt { margin-top: 8px; font-size: 12.5px; color: var(--danger); }
    .call-keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 10px; }
    .call-keypad button {
      min-height: 40px; border-radius: 9px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer;
      background: var(--surface2); color: var(--text); border: 1px solid var(--border);
    }
    .call-keypad button:hover { border-color: var(--muted); }
    .call-keypad button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `]
})
export class CallBarComponent {
  readonly tel = inject(TelephonyService);
  readonly keypad = signal(false);
  readonly DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  readonly stateLabel = computed(() => {
    const c = this.tel.call();
    if (!c) return '';
    switch (c.state) {
      case 'starting': return 'Connexion…';
      case 'ringing':  return `Ça sonne… ${c.number}`;
      case 'open':     return `En ligne · ${this._clock(c.seconds)}`;
      default:         return c.seconds > 0 ? `Appel terminé · ${this._clock(c.seconds)}` : 'Appel terminé';
    }
  });

  private _clock(seconds: number): string {
    const m = Math.floor(seconds / 60), s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
