import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface WeekHistoryItem { weekStart: string; isLocked: boolean; }

/**
 * Historique des semaines pointées d'un employé : statut de chaque semaine, semaine affichée
 * mise en évidence, aperçu limité avec « Voir tout ». Le clic remonte la semaine via (openWeek).
 */
@Component({
  selector: 'app-week-history-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './week-history-panel.component.html',
  styleUrls: ['./week-history-panel.component.scss'],
})
export class WeekHistoryPanelComponent {
  @Input() weeks: WeekHistoryItem[] = [];
  /** Lundi (yyyy-MM-dd) de la semaine affichée. */
  @Input() currentWeek = '';
  /** Changement d'employé → l'historique revient à l'aperçu. */
  @Input() set employeeId(_: string | null) { this.showAll.set(false); }
  @Output() openWeek = new EventEmitter<string>();

  readonly previewSize = 8;
  readonly showAll = signal(false);

  get visibleWeeks(): WeekHistoryItem[] {
    return this.showAll() ? this.weeks : this.weeks.slice(0, this.previewSize);
  }

  trackByWeek(_: number, w: WeekHistoryItem): string { return w.weekStart; }
}
