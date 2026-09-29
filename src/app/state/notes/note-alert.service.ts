import { Injectable, signal } from '@angular/core';
import { NotesService, NoteItem, NoteAlertRefs } from './notes.service';

/**
 * Affiche les notes actives liées aux entités (employé, compagnie, facture) sur lesquelles
 * l'utilisateur agit. Les pages appellent simplement `check(refs, action)` ; l'affichage
 * est fait une seule fois par <app-note-alert> dans le shell de l'application.
 *
 * Anti-doublon :
 *  - les appels rapprochés (même action déclenchant plusieurs vérifications, ex. ouverture
 *    d'une facture puis sélection de sa compagnie) sont regroupés en une seule requête ;
 *  - une note déjà affichée dans l'alerte ouverte n'y est pas ajoutée une seconde fois.
 */
@Injectable({ providedIn: 'root' })
export class NoteAlertService {
  /** Fenêtre de regroupement des vérifications issues d'une même action. */
  private static readonly BATCH_MS = 150;

  private readonly _notes  = signal<NoteItem[]>([]);
  private readonly _action = signal('');
  readonly notes  = this._notes.asReadonly();
  readonly action = this._action.asReadonly();

  private pending: Required<NoteAlertRefs> = { employeeIds: [], companyIds: [], billIds: [] };
  private pendingAction = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private notesSvc: NotesService) {}

  check(refs: NoteAlertRefs, action: string): void {
    this.pending.employeeIds.push(...(refs.employeeIds ?? []));
    this.pending.companyIds .push(...(refs.companyIds  ?? []));
    this.pending.billIds    .push(...(refs.billIds     ?? []));
    if (!this.pendingAction) this.pendingAction = action;

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), NoteAlertService.BATCH_MS);
  }

  dismiss(): void {
    this._notes.set([]);
    this._action.set('');
  }

  private flush(): void {
    const refs   = this.pending;
    const action = this.pendingAction;
    this.pending       = { employeeIds: [], companyIds: [], billIds: [] };
    this.pendingAction = '';
    this.timer         = null;

    if (!refs.employeeIds.some(Boolean) && !refs.companyIds.some(Boolean) && !refs.billIds.some(Boolean)) return;

    this.notesSvc.getAlerts(refs).subscribe({
      next: found => this.show(found, action),
      // Une alerte ne doit jamais bloquer l'action en cours.
      error: () => {},
    });
  }

  /** Affiche des notes déjà chargées par la page (sans nouvelle requête) ; ignore celles déjà affichées. */
  show(found: NoteItem[], action: string): void {
    const shown = new Set(this._notes().map(n => n.noteId));
    const fresh = found.filter(n => n.isActive && !shown.has(n.noteId));
    if (!fresh.length) return;
    if (!shown.size) this._action.set(action);
    this._notes.update(list => [...list, ...fresh]);
  }
}
