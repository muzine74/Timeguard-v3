import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Guide utilisateur (page statique, accessible à tous les utilisateurs connectés). */
@Component({
  selector: 'app-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './help.component.html',
  styleUrls: ['./help.component.scss'],
})
export class HelpComponent {
  readonly sections = [
    { id: 'premiers-pas',   title: 'Premiers pas' },
    { id: 'pointage',       title: 'Pour les employés : saisir son pointage' },
    { id: 'employes',       title: 'Gérer les employés' },
    { id: 'compagnies',     title: 'Gérer les compagnies' },
    { id: 'validation',     title: 'Valider le pointage' },
    { id: 'facturation',    title: 'Facturer vos compagnies' },
    { id: 'paiements',      title: 'Payer vos employés' },
    { id: 'notes',          title: 'Notes et alertes' },
    { id: 'administration', title: 'Statistiques et administration' },
    { id: 'faq',            title: 'Questions fréquentes' },
  ];

  /** Défilement vers une section (les ancres #id seraient interceptées par le routeur). */
  goTo(id: string, event: Event): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
