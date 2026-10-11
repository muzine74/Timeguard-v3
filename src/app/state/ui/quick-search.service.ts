import { Injectable, signal } from '@angular/core';

export interface QuickSearchPage { label: string; icon: string; link: string; group: string; }

/**
 * Recherche globale : le bouton est dans la barre de navigation, la fenêtre est montée à la racine
 * (AppComponent). La barre a un effet de flou qui enfermerait une fenêtre « fixed » placée dedans.
 */
@Injectable({ providedIn: 'root' })
export class QuickSearchService {
  readonly isOpen = signal(false);
  /** Pages du menu visibles pour l'utilisateur (fournies par la barre de navigation). */
  readonly pages  = signal<QuickSearchPage[]>([]);

  open():   void { this.isOpen.set(true); }
  close():  void { this.isOpen.set(false); }
  toggle(): void { this.isOpen.set(!this.isOpen()); }
}
