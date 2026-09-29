import { Component, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, Input, OnChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { NotesService, NoteItem, NoteAlertRefs, NOTE_LINK_LABELS } from '../../../state/notes/notes.service';

/**
 * Encadré des notes actives concernant l'écran courant (affiché en permanence, avant l'action).
 * - `[refs]`  : l'encadré charge lui-même les notes (même endpoint et mêmes règles que l'alerte).
 * - `[notes]` : la page fournit des notes déjà chargées (ex. une requête groupée pour une liste).
 * Seules les notes actives sont affichées ; rien n'est rendu s'il n'y en a aucune.
 */
@Component({
  selector: 'app-note-inline',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="ni" *ngIf="visible.length" [class.ni-compact]="compact">
      <div class="ni-note" *ngFor="let n of visible">
        <span class="ni-icon">📝</span>
        <div class="ni-body">
          <div class="ni-title">
            {{ n.title }}
            <ng-container *ngIf="!compact">
              <span class="ni-link" *ngFor="let l of n.links">
                {{ labels[l.entityType] }}<ng-container *ngIf="l.entityName"> · {{ l.entityName }}</ng-container>
              </span>
            </ng-container>
          </div>
          <div class="ni-desc" *ngIf="n.description">{{ n.description }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .ni {
      display: flex; flex-direction: column; gap: 6px;
      background: rgba(224,154,34,.08); border: 1px solid rgba(224,154,34,.35);
      border-radius: 10px; padding: 10px 12px; margin: 0 0 14px;
    }
    .ni-compact { padding: 6px 8px; margin: 6px 0 0; border-radius: 8px; }
    .ni-note { display: flex; gap: 8px; align-items: flex-start; }
    .ni-icon { line-height: 1.3; }
    .ni-body { min-width: 0; }
    .ni-title { font-weight: 600; font-size: .85rem; color: var(--warning); }
    .ni-compact .ni-title { font-size: .78rem; }
    .ni-link {
      margin-left: 6px; font-weight: 600; font-size: .7rem; color: var(--accent);
      background: rgba(201,162,39,.12); border: 1px solid rgba(201,162,39,.3);
      border-radius: 10px; padding: 1px 7px;
    }
    .ni-desc { font-size: .8rem; color: var(--text); opacity: .85; white-space: pre-wrap; margin-top: 2px; }
    .ni-compact .ni-desc { font-size: .74rem; }
  `],
})
export class NoteInlineComponent implements OnChanges {
  @Input() refs: NoteAlertRefs | null = null;
  @Input() notes: NoteItem[] | null = null;
  /** Présentation réduite (ex. dans une ligne de tableau). */
  @Input() compact = false;

  readonly labels = NOTE_LINK_LABELS;
  visible: NoteItem[] = [];

  private notesSvc   = inject(NotesService);
  private cdr        = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private lastKey    = '';
  private sub?: Subscription;

  ngOnChanges(): void {
    if (this.notes) {
      this.visible = this.notes.filter(n => n.isActive);
      return;
    }

    const key = JSON.stringify(this.refs ?? {});
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.sub?.unsubscribe();
    this.visible = [];

    if (!this.refs) return;
    this.sub = this.notesSvc.getAlerts(this.refs)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => { this.visible = list.filter(n => n.isActive); this.cdr.markForCheck(); },
        error: () => {},
      });
  }
}
