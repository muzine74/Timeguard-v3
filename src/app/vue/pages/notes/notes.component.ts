import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NotesService, NoteItem, NoteLink, NoteLinkType, NOTE_LINK_LABELS } from '../../../state/notes/notes.service';
import { NoteLinkOptionsService } from '../../../state/notes/note-link-options.service';
import { EmployeesService } from '../../../state/employees/employees.service';
import { NoteLinksEditorComponent } from '../../components/note-links-editor/note-links-editor.component';
import { MultiSelectComponent, MultiSelectOption } from '../../components/multi-select/multi-select.component';
import { AttachmentsComponent } from '../../components/attachments/attachments.component';
import { AttachmentsService, AttachmentItem } from '../../../state/attachments/attachments.service';

/**
 * Critères de filtre. Entre critères : ET. Dans un critère à choix multiple : OU
 * (ex. 2 employés cochés → notes de l'un OU de l'autre). Un critère vide est ignoré.
 */
interface NoteFilters {
  search:      string;
  employeeIds: string[];
  companyIds:  string[];
  billIds:     string[];
  linkTypes:   (NoteLinkType | 'none')[];
  status:      'all' | 'active' | 'inactive';
  dateFrom:    string;   // yyyy-MM-dd (date de création, inclusive)
  dateTo:      string;
}

@Component({
    selector: 'app-notes',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, NoteLinksEditorComponent, MultiSelectComponent, AttachmentsComponent],
    templateUrl: './notes.component.html',
    styleUrls: ['./notes.component.scss']
})
export class NotesComponent implements OnInit {
  notes    = signal<NoteItem[]>([]);
  loading  = signal(false);
  saving   = signal(false);
  error    = signal('');

  /** Notes actuellement dépliées (affichent leur description). */
  expandedIds = signal<Set<string>>(new Set());

  /** Sections « Nouvelle note » et « Recherche » : repliées par défaut. */
  addOpen    = signal(false);
  searchOpen = signal(false);

  /** Nombre de critères de recherche actifs (affiché sur la section repliée). */
  get activeFilterCount(): number {
    const f = this.filters;
    return [f.search.trim(), f.employeeIds.length, f.companyIds.length, f.billIds.length, f.linkTypes.length,
            f.status !== 'all', f.dateFrom, f.dateTo].filter(Boolean).length;
  }

  canEdit(n: NoteItem): boolean { return n.canEdit !== false; }

  newTitle = '';
  newDescription = '';
  newActive = true;
  newLinks: NoteLink[] = [];
  /** Fichiers choisis pour la nouvelle note : envoyés une fois la note créée. */
  newFiles: File[] = [];

  editingId: string | null = null;
  editTitle = '';
  editDescription = '';
  editActive = true;
  editLinks: NoteLink[] = [];

  // ── Liens (plusieurs employés / compagnies / factures par note) ───────
  readonly linkTypes = Object.entries(NOTE_LINK_LABELS) as [NoteLinkType, string][];
  readonly linkLabels = NOTE_LINK_LABELS;

  // ── Filtres ───────────────────────────────────────────────────────────
  filters: NoteFilters = NotesComponent.emptyFilters();

  private static emptyFilters(): NoteFilters {
    return { search: '', employeeIds: [], companyIds: [], billIds: [], linkTypes: [], status: 'all', dateFrom: '', dateTo: '' };
  }

  /** Options du filtre « Type de lien » (inclut « Sans lien »). */
  readonly linkTypeOptions: MultiSelectOption[] = [
    { id: 'none', label: 'Sans lien' },
    ...(Object.entries(NOTE_LINK_LABELS) as [NoteLinkType, string][]).map(([id, label]) => ({ id, label })),
  ];

  get hasFilters(): boolean {
    const f = this.filters;
    return !!(f.search.trim() || f.employeeIds.length || f.companyIds.length || f.billIds.length
      || f.linkTypes.length || f.status !== 'all' || f.dateFrom || f.dateTo);
  }

  resetFilters(): void {
    this.filters = NotesComponent.emptyFilters();
  }

  /** Notes affichées : doivent respecter TOUS les critères sélectionnés. */
  get filteredNotes(): NoteItem[] {
    const f = this.filters;
    const q = f.search.trim().toLowerCase();
    const lower = (v: string | null | undefined) => (v ?? '').toLowerCase();
    const employees = this.empSvc.list();

    const selEmployees = new Set(f.employeeIds.map(lower));
    const selCompanies = new Set(f.companyIds.map(lower));
    const selBills     = new Set(f.billIds.map(lower));
    // Employé : note liée à l'un des employés cochés OU à l'une de leurs compagnies (même règle que les alertes).
    const viaEmployeeCompanies = new Set(employees
      .filter(e => selEmployees.has(lower(e.employeeId)))
      .flatMap(e => (e.employeeCompagnies ?? []).map(c => lower(c.compagnieId))));
    // Compagnie : note liée à l'une des compagnies cochées OU à l'un de leurs employés (symétrique).
    const viaCompanyEmployees = new Set(employees
      .filter(e => (e.employeeCompagnies ?? []).some(c => selCompanies.has(lower(c.compagnieId))))
      .map(e => lower(e.employeeId)));

    // Une note avec plusieurs liens correspond à un critère si L'UN de ses liens y correspond.
    const has = (n: NoteItem, type: NoteLinkType, ids: Set<string>) =>
      n.links.some(l => l.entityType === type && ids.has(lower(l.entityId)));

    return this.notes().filter(n => {
      const linkNames = n.links.map(l => l.entityName ?? '').join(' ');
      if (q && !(`${n.title} ${n.description} ${linkNames} ${n.createdByEmployeeName}`.toLowerCase().includes(q))) return false;
      if (f.status === 'active'   && !n.isActive) return false;
      if (f.status === 'inactive' &&  n.isActive) return false;
      if (f.linkTypes.length) {
        const ok = f.linkTypes.some(t => t === 'none' ? n.links.length === 0 : n.links.some(l => l.entityType === t));
        if (!ok) return false;
      }
      if (selEmployees.size && !has(n, 'employee', selEmployees) && !has(n, 'company', viaEmployeeCompanies)) return false;
      if (selCompanies.size && !has(n, 'company', selCompanies) && !has(n, 'employee', viaCompanyEmployees)) return false;
      if (selBills.size && !has(n, 'bill', selBills)) return false;
      const day = this.localDay(n.createdAt);
      if (f.dateFrom && day < f.dateFrom) return false;
      if (f.dateTo   && day > f.dateTo)   return false;
      return true;
    });
  }

  // ── Actives en haut, inactives repliées en bas ────────────────────────
  showInactive = false;

  /** La section inactive s'ouvre d'elle-même si l'on filtre sur « Inactives ». */
  get inactiveOpen(): boolean {
    return this.showInactive || this.filters.status === 'inactive';
  }

  get groupedNotes(): { active: NoteItem[]; inactive: NoteItem[] } {
    const list = this.filteredNotes;
    return { active: list.filter(n => n.isActive), inactive: list.filter(n => !n.isActive) };
  }

  linkText(l: NoteLink): string {
    return l.entityName ? `${this.linkLabels[l.entityType]} · ${l.entityName}` : this.linkLabels[l.entityType];
  }

  trackByNote(_: number, n: NoteItem): string {
    return n.noteId;
  }

  private localDay(iso: string): string {
    const d = new Date(iso);
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private destroyRef = inject(DestroyRef);

  constructor(
    private notesSvc: NotesService,
    private empSvc:   EmployeesService,
    public  optSvc:   NoteLinkOptionsService,
    private cdr:      ChangeDetectorRef,
    private filesSvc: AttachmentsService,
  ) {}

  ngOnInit(): void {
    this.load();
    // Listes des filtres Employé / Compagnie (partagées avec l'éditeur de liens).
    this.optSvc.ensure('employee', true);
    this.optSvc.ensure('company',  true);
    this.optSvc.ensure('bill',     true);
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
    this.notesSvc.create({ title, description: this.newDescription.trim(), isActive: this.newActive, links: this.linkPayload(this.newLinks) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          const files = this.newFiles;
          this.newTitle = '';
          this.newDescription = '';
          this.newActive = true;
          this.newLinks = [];
          this.newFiles = [];
          // La note existe : ses pièces jointes sont envoyées, puis la liste est rechargée
          this.filesSvc.uploadAll('note', res.noteId, files).subscribe(up => {
            this.saving.set(false);
            this.addOpen.set(false);
            this.load();
            if (up.errors.length) this.error.set(`Note créée, mais ${up.errors.length} pièce(s) jointe(s) refusée(s) — ${up.errors.join(' ; ')}`);
            this.cdr.markForCheck();
          });
        },
        error: err => {
          this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
          this.saving.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  setAttachments(note: NoteItem, attachments: AttachmentItem[]): void {
    this.notes.update(list => list.map(n => n.noteId === note.noteId ? { ...n, attachments } : n));
    this.cdr.markForCheck();
  }

  isExpanded(note: NoteItem): boolean {
    return this.expandedIds().has(note.noteId);
  }

  toggleExpand(note: NoteItem): void {
    // Pendant l'édition la note reste ouverte (on ne la replie pas) ; une note fermée peut toujours s'ouvrir
    if (this.editingId === note.noteId && this.isExpanded(note)) return;
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
    this.editLinks       = [...note.links];
    // Le formulaire est dans le contenu de la note : l'ouvrir, sinon « Modifier » ne montre rien
    // (et la note restait impossible à déplier tant qu'elle était « en édition »).
    this.expandedIds.update(set => new Set(set).add(note.noteId));
  }

  cancelEdit(event: Event): void {
    event.stopPropagation();
    this.editingId = null;
  }

  saveEdit(note: NoteItem, event: Event): void {
    event.stopPropagation();
    const title = this.editTitle.trim();
    if (!title) return;

    this.notesSvc.update(note.noteId, { title, description: this.editDescription.trim(), isActive: this.editActive, links: this.linkPayload(this.editLinks) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          // Mise à jour sur place (la liste n'est pas rechargée : la note reste ouverte, sans clignotement)
          const links = this.editLinks.map(l => ({ ...l }));
          this.notes.update(list => list.map(n => n.noteId === note.noteId
            ? { ...n, title, description: this.editDescription.trim(), isActive: this.editActive, links }
            : n));
          this.editingId = null;
          this.cdr.markForCheck();
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

  // ── Liens ────────────────────────────────────────────────────────────

  private linkPayload(links: NoteLink[]) {
    return links.map(l => ({ entityType: l.entityType, entityId: l.entityId }));
  }

  fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}
