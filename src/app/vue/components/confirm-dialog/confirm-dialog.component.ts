import { Component, ChangeDetectionStrategy, ElementRef, HostListener, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../state/ui/confirm.service';

/** Fenêtre de confirmation commune (voir ConfirmService). Montée une seule fois, dans AppComponent. */
@Component({
    selector: 'app-confirm-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
    <div class="cd-backdrop" *ngIf="svc.current() as req" (click)="svc.answer(false)">
      <div class="cd-box" role="alertdialog" aria-modal="true" aria-labelledby="cd-title"
           [attr.aria-describedby]="req.message ? 'cd-message' : null" (click)="$event.stopPropagation()">
        <div class="cd-icon" [class.cd-icon-danger]="req.danger" aria-hidden="true">{{ req.danger ? '!' : '?' }}</div>
        <h2 class="cd-title" id="cd-title">{{ req.title }}</h2>
        <p class="cd-message" id="cd-message" *ngIf="req.message">{{ req.message }}</p>
        <div class="cd-actions">
          <button #cancelBtn type="button" class="btn btn-outline" (click)="svc.answer(false)">{{ req.cancelLabel || 'Annuler' }}</button>
          <button #confirmBtn type="button" class="btn" [class.btn-primary]="!req.danger" [class.cd-danger]="req.danger"
                  (click)="svc.answer(true)">{{ req.confirmLabel || 'Confirmer' }}</button>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .cd-backdrop {
      position: fixed; inset: 0; z-index: 3000;
      background: rgba(0, 0, 0, .55);
      display: flex; align-items: center; justify-content: center; padding: 16px;
      animation: cd-fade .12s ease-out;
    }
    .cd-box {
      width: 100%; max-width: 420px;
      background: var(--surface); color: var(--text);
      border: 1px solid var(--border); border-radius: 14px;
      padding: 22px 22px 18px; text-align: center;
      box-shadow: 0 18px 50px rgba(0, 0, 0, .35);
      animation: cd-pop .14s ease-out;
    }
    .cd-icon {
      width: 42px; height: 42px; margin: 0 auto 12px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 800;
      background: rgba(var(--accent-rgb), .14); color: var(--accent);
    }
    .cd-icon-danger { background: rgba(224, 82, 82, .14); color: var(--danger); }
    .cd-title   { font-size: 16px; font-weight: 700; margin: 0; overflow-wrap: anywhere; }
    .cd-message { font-size: 13px; color: var(--muted); margin: 8px 0 0; line-height: 1.5; overflow-wrap: anywhere; white-space: pre-line; }
    .cd-actions { display: flex; justify-content: center; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    .cd-actions .btn { cursor: pointer; font-family: inherit; }
    .cd-danger {
      background: var(--danger); color: #fff; border-color: var(--danger);
    }
    .cd-danger:hover { filter: brightness(1.08); }
    @keyframes cd-fade { from { opacity: 0; } }
    @keyframes cd-pop  { from { opacity: 0; transform: translateY(6px) scale(.98); } }
    @media (prefers-reduced-motion: reduce) { .cd-backdrop, .cd-box { animation: none; } }
  `]
})
export class ConfirmDialogComponent {
  @ViewChild('cancelBtn')  cancelBtn?:  ElementRef<HTMLButtonElement>;
  @ViewChild('confirmBtn') confirmBtn?: ElementRef<HTMLButtonElement>;

  /** Élément qui avait le focus avant l'ouverture : il le retrouve à la fermeture. */
  private _opener: HTMLElement | null = null;

  constructor(public svc: ConfirmService) {
    effect(() => {
      const req = this.svc.current();
      if (req) {
        this._opener = document.activeElement as HTMLElement | null;
        // Action irréversible : le focus va sur Annuler, pour qu'Entrée ne supprime pas par réflexe
        setTimeout(() => (req.danger ? this.cancelBtn : this.confirmBtn)?.nativeElement.focus());
      } else if (this._opener) {
        const opener = this._opener;
        this._opener = null;
        setTimeout(() => { if (document.contains(opener)) opener.focus(); });
      }
    });
  }

  @HostListener('document:keydown', ['$event'])
  onKey(ev: KeyboardEvent): void {
    if (!this.svc.current()) return;
    if (ev.key === 'Escape') { ev.preventDefault(); this.svc.answer(false); return; }
    // Le focus reste dans la fenêtre
    if (ev.key === 'Tab') {
      const a = this.cancelBtn?.nativeElement, b = this.confirmBtn?.nativeElement;
      if (!a || !b) return;
      ev.preventDefault();
      (document.activeElement === a ? b : a).focus();
    }
  }
}
