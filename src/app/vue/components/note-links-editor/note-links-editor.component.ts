import { Component, ChangeDetectionStrategy, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NoteLink, NoteLinkType, NOTE_LINK_LABELS } from '../../../state/notes/notes.service';
import { NoteLinkOptionsService } from '../../../state/notes/note-link-options.service';
import { MultiSelectComponent } from '../multi-select/multi-select.component';

/**
 * Édition des liens d'une note : un menu à cases par type (employés, compagnies, factures),
 * plusieurs éléments cochables dans chacun. Utilisé à l'identique en création et en modification ([(links)]).
 */
@Component({
    selector: 'app-note-links-editor',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, MultiSelectComponent],
    template: `
    <div class="nle" (click)="$event.stopPropagation()">
      <div class="nle-row">
        <app-multi-select *ngFor="let t of types"
                          [options]="optSvc.options(t.type)"
                          [selected]="idsOf(t.type)"
                          (selectedChange)="setIds(t.type, $event)"
                          [placeholder]="t.placeholder" [plural]="t.plural"></app-multi-select>
      </div>
      <div class="nle-chips" *ngIf="links.length">
        <span class="nle-chip" *ngFor="let l of links; let i = index">
          <span class="nle-type">{{ labels[l.entityType] }}</span>
          {{ l.entityName || optSvc.label(l.entityType, l.entityId) || '…' }}
          <button type="button" class="nle-x" title="Retirer" [disabled]="disabled" (click)="remove(i)">✕</button>
        </span>
      </div>
    </div>
  `,
    styles: [`
    .nle { display: flex; flex-direction: column; gap: 8px; }
    .nle-row { display: flex; flex-wrap: wrap; gap: 10px; }
    .nle-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .nle-chip {
      display: inline-flex; align-items: center; gap: 6px; max-width: 100%;
      background: rgba(var(--accent-rgb), .12); border: 1px solid rgba(var(--accent-rgb), .3); color: var(--text);
      border-radius: 14px; padding: 3px 4px 3px 10px; font-size: .8rem;
    }
    .nle-type { color: var(--accent); font-weight: 600; font-size: .72rem; }
    .nle-x {
      border: none; background: transparent; color: var(--muted); cursor: pointer;
      width: 20px; height: 20px; border-radius: 50%; font-size: .7rem;
    }
    .nle-x:hover:not(:disabled) { color: var(--danger); background: rgba(224,82,82,.12); }
  `]
})
export class NoteLinksEditorComponent implements OnInit {
  @Input() links: NoteLink[] = [];
  @Output() linksChange = new EventEmitter<NoteLink[]>();
  @Input() disabled = false;

  readonly labels = NOTE_LINK_LABELS;
  readonly types: { type: NoteLinkType; placeholder: string; plural: string }[] = [
    { type: 'employee', placeholder: 'Lier à des employés…',    plural: 'employés' },
    { type: 'company',  placeholder: 'Lier à des compagnies…',  plural: 'compagnies' },
    { type: 'bill',     placeholder: 'Lier à des factures…',    plural: 'factures' },
  ];

  constructor(public optSvc: NoteLinkOptionsService) {}

  ngOnInit(): void {
    this.types.forEach(t => this.optSvc.ensure(t.type, true));
  }

  idsOf(type: NoteLinkType): string[] {
    return this.links.filter(l => l.entityType === type).map(l => l.entityId);
  }

  /** Cases cochées d'un type → liens de ce type (les autres types sont conservés). */
  setIds(type: NoteLinkType, ids: string[]): void {
    const kept = this.links.filter(l => l.entityType !== type || ids.includes(l.entityId));
    const added = ids
      .filter(id => !kept.some(l => l.entityType === type && l.entityId === id))
      .map(id => ({ entityType: type, entityId: id, entityName: this.optSvc.label(type, id) }));
    this.linksChange.emit([...kept, ...added]);
  }

  remove(index: number): void {
    this.linksChange.emit(this.links.filter((_, i) => i !== index));
  }
}
