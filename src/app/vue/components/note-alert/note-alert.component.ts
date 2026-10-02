import { Component, ChangeDetectionStrategy, OnDestroy, ElementRef, HostListener, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { NoteLinkType, NOTE_LINK_LABELS } from '../../../state/notes/notes.service';

/** Alerte globale des notes actives — montée une seule fois dans AppComponent. */
@Component({
  selector: 'app-note-alert',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="na-backdrop" *ngIf="alerts.notes().length" (click)="alerts.dismiss()">
      <div class="na-modal" role="alertdialog" aria-modal="true" aria-labelledby="na-title" aria-describedby="na-list"
           (click)="$event.stopPropagation()">
        <div class="na-hdr">
          <span class="na-icon" aria-hidden="true">📝</span>
          <div>
            <div class="na-title" id="na-title">
              {{ alerts.notes().length > 1 ? alerts.notes().length + ' notes actives' : 'Note active' }}
            </div>
            <div class="na-action" *ngIf="alerts.action()">{{ alerts.action() }}</div>
          </div>
        </div>

        <div class="na-list" id="na-list">
          <div class="na-note" *ngFor="let n of alerts.notes()">
            <div class="na-note-top">
              <span class="na-badge" *ngFor="let l of n.links">
                {{ linkLabel(l.entityType) }}<ng-container *ngIf="l.entityName"> · {{ l.entityName }}</ng-container>
              </span>
              <span class="na-author">{{ n.createdByEmployeeName }}</span>
            </div>
            <div class="na-note-title">{{ n.title }}</div>
            <p class="na-note-desc" *ngIf="n.description">{{ n.description }}</p>
          </div>
        </div>

        <div class="na-ftr">
          <button #okBtn type="button" class="na-btn" (click)="alerts.dismiss()">J'ai compris</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .na-btn:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
    .na-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0,0,0,.6);
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .na-modal {
      width: 100%; max-width: 520px; max-height: 80vh; display: flex; flex-direction: column;
      background: var(--surface); color: var(--text);
      border: 1px solid rgba(224,154,34,.45); border-radius: 12px;
      box-shadow: 0 12px 40px rgba(0,0,0,.5);
    }
    .na-hdr { display: flex; gap: 12px; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--border); }
    .na-icon { font-size: 1.4rem; }
    .na-title { font-weight: 700; font-size: 1rem; color: var(--warning); }
    .na-action { font-size: .8rem; color: var(--muted); margin-top: 2px; }
    .na-list { overflow-y: auto; padding: 12px 18px; display: flex; flex-direction: column; gap: 10px; }
    .na-note { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; }
    .na-note-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 8px; font-size: .72rem; margin-bottom: 4px; }
    .na-badge {
      background: rgba(var(--accent-rgb), .12); border: 1px solid rgba(var(--accent-rgb), .3); color: var(--accent);
      padding: 1px 8px; border-radius: 20px; font-weight: 600;
    }
    .na-author { color: var(--muted); margin-left: auto; }
    .na-note-title { font-weight: 600; font-size: .92rem; }
    .na-note-desc { margin: 6px 0 0; font-size: .85rem; color: var(--text); white-space: pre-wrap; opacity: .85; }
    .na-ftr { display: flex; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--border); }
    .na-btn {
      padding: 8px 18px; border-radius: 8px; border: none; cursor: pointer;
      background: var(--accent); color: var(--on-accent); font-weight: 600; font-size: .85rem;
    }
  `],
})
export class NoteAlertComponent implements OnDestroy {
  @ViewChild('okBtn') private okBtn?: ElementRef<HTMLButtonElement>;
  /** Élément qui avait le focus avant l'ouverture : il le retrouve à la fermeture. */
  private returnFocus: HTMLElement | null = null;

  constructor(public alerts: NoteAlertService) {
    // Ouverture → focus sur « J'ai compris » ; fermeture → retour du focus à l'élément d'origine.
    effect(() => {
      const open = this.alerts.notes().length > 0;
      if (open && !this.returnFocus) {
        this.returnFocus = document.activeElement as HTMLElement | null;
        setTimeout(() => this.okBtn?.nativeElement.focus());
      } else if (!open && this.returnFocus) {
        const el = this.returnFocus;
        this.returnFocus = null;
        setTimeout(() => el.focus?.());
      }
    });
  }

  private get isOpen(): boolean { return this.alerts.notes().length > 0; }

  /** Échap ferme l'alerte. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.alerts.dismiss();
  }

  /** Le focus reste dans la fenêtre (seul élément focusable : « J'ai compris »). */
  @HostListener('document:keydown.tab', ['$event'])
  @HostListener('document:keydown.shift.tab', ['$event'])
  onTab(ev: Event): void {
    if (!this.isOpen) return;
    ev.preventDefault();
    this.okBtn?.nativeElement.focus();
  }

  // Détruit à la déconnexion → ne pas ré-afficher une alerte de la session précédente.
  ngOnDestroy(): void {
    this.alerts.dismiss();
  }

  linkLabel(type: NoteLinkType): string {
    return NOTE_LINK_LABELS[type];
  }
}
