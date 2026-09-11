import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotesService, NoteItem } from '../../../state/notes/notes.service';

@Component({
  selector: 'app-notes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './notes.component.html',
  styleUrls: ['./notes.component.scss'],
})
export class NotesComponent implements OnInit {
  notes    = signal<NoteItem[]>([]);
  loading  = signal(false);
  saving   = signal(false);
  error    = signal('');

  /** Notes actuellement dépliées (affichent leur description). */
  expandedIds = signal<Set<string>>(new Set());

  newTitle = '';
  newDescription = '';
  newActive = true;

  editingId: string | null = null;
  editTitle = '';
  editDescription = '';
  editActive = true;

  private destroyRef = inject(DestroyRef);

  constructor(
    private notesSvc: NotesService,
    private cdr:      ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.notesSvc.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => {
          this.notes.set(list);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.loading.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  add(): void {
    const title = this.newTitle.trim();
    if (!title) return;

    this.saving.set(true);
    this.notesSvc.create({ title, description: this.newDescription.trim(), isActive: this.newActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.newTitle = '';
          this.newDescription = '';
          this.newActive = true;
          this.saving.set(false);
          this.load();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.saving.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  isExpanded(note: NoteItem): boolean {
    return this.expandedIds().has(note.noteId);
  }

  toggleExpand(note: NoteItem): void {
    if (this.editingId === note.noteId) return; // ne pas replier pendant l'édition
    this.expandedIds.update(set => {
      const next = new Set(set);
      if (next.has(note.noteId)) next.delete(note.noteId);
      else next.add(note.noteId);
      return next;
    });
  }

  toggleActive(note: NoteItem, event: Event): void {
    event.stopPropagation();
    const next = !note.isActive;
    this.notesSvc.setActive(note.noteId, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notes.update(list => list.map(n => n.noteId === note.noteId ? { ...n, isActive: next } : n));
          this.cdr.markForCheck();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.cdr.markForCheck();
        },
      });
  }

  startEdit(note: NoteItem, event: Event): void {
    event.stopPropagation();
    this.editingId       = note.noteId;
    this.editTitle       = note.title;
    this.editDescription = note.description;
    this.editActive      = note.isActive;
  }

  cancelEdit(event: Event): void {
    event.stopPropagation();
    this.editingId = null;
  }

  saveEdit(note: NoteItem, event: Event): void {
    event.stopPropagation();
    const title = this.editTitle.trim();
    if (!title) return;

    this.notesSvc.update(note.noteId, { title, description: this.editDescription.trim(), isActive: this.editActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editingId = null;
          this.load();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.cdr.markForCheck();
        },
      });
  }

  remove(note: NoteItem, event: Event): void {
    event.stopPropagation();
    this.notesSvc.delete(note.noteId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.notes.update(list => list.filter(n => n.noteId !== note.noteId));
          this.cdr.markForCheck();
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.cdr.markForCheck();
        },
      });
  }

  fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
