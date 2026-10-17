import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { MULTI_SEARCH_HINT } from '../../shared/multi-search';

/**
 * Courte indication placée à côté d'un champ de recherche multicritères.
 * Relier le champ par `aria-describedby` :
 *   <input type="search" aria-describedby="emp-search-hint" … />
 *   <app-search-hint hintId="emp-search-hint" />
 */
@Component({
    selector: 'app-search-hint',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `<small class="sh" [id]="hintId" title="Ex. : dupont &amp; montréal — les lignes contenant les deux mots ; dupont | tremblay — celles contenant l'un ou l'autre">
      <span aria-hidden="true">ⓘ</span> {{ text }}</small>`,
    styles: [`
    :host { display: inline-flex; min-width: 0; }
    .sh { font-size: 11px; line-height: 1.3; color: var(--muted); font-weight: 400; text-transform: none; letter-spacing: 0; }
  `]
})
export class SearchHintComponent {
  @Input() hintId = '';
  readonly text = MULTI_SEARCH_HINT;
}
