import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  /** Question posée, en une ligne (« Supprimer cette charge ? »). */
  title:         string;
  /** Précision facultative : ce qui sera perdu, ce qui ne changera pas. */
  message?:      string;
  /** Libellé du bouton de confirmation (« Supprimer », « Quitter sans enregistrer »…). */
  confirmLabel?: string;
  cancelLabel?:  string;
  /** Action irréversible : le bouton de confirmation est rouge et le bouton Annuler reçoit le focus. */
  danger?:       boolean;
}

export interface ConfirmRequest extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * Fenêtre de confirmation de l'application (remplace `confirm()` du navigateur).
 * Le composant `app-confirm-dialog`, monté une fois dans AppComponent, affiche la demande en cours.
 *
 *     if (!await this.confirm.ask({ title: 'Supprimer cette charge ?', confirmLabel: 'Supprimer', danger: true })) return;
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _current = signal<ConfirmRequest | null>(null);
  readonly current = this._current.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    // Une demande déjà ouverte est annulée : une seule fenêtre à la fois
    this._current()?.resolve(false);
    return new Promise<boolean>(resolve => this._current.set({ ...options, resolve }));
  }

  /** Confirmation d'une action irréversible (suppression). */
  danger(title: string, message?: string, confirmLabel = 'Supprimer'): Promise<boolean> {
    return this.ask({ title, message, confirmLabel, danger: true });
  }

  /** Saisie non enregistrée : quitter quand même ? */
  discard(message: string): Promise<boolean> {
    return this.ask({
      title: 'Modifications non enregistrées', message,
      confirmLabel: 'Quitter sans enregistrer', cancelLabel: 'Continuer la saisie', danger: true,
    });
  }

  /** Appelé par le composant : ferme la fenêtre et répond à l'appelant. */
  answer(ok: boolean): void {
    const req = this._current();
    if (!req) return;
    this._current.set(null);
    req.resolve(ok);
  }
}
