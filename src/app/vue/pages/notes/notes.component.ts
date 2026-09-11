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

  newText = '';
  newActive = true;

  editingId: string | null = null;
  editText  = '';
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
    const text = this.newText.trim();
    if (!text) return;

    this.saving.set(true);
    this.notesSvc.create({ text, isActive: this.newActive })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.newText = '';
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

  toggleActive(note: NoteItem): void {
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

  startEdit(note: NoteItem): void {
    this.editingId  = note.noteId;
    this.editText   = note.text;
    this.editActive = note.isActive;
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  saveEdit(note: NoteItem): void {
    const text = this.editText.trim();
    if (!text) return;

    this.notesSvc.update(note.noteId, { text, isActive: this.editActive })
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

  remove(note: NoteItem): void {
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
