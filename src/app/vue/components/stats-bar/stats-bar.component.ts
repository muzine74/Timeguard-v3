import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SaveStateService } from '../../../state/pointage/save-state.service';

@Component({
  selector: 'app-stats-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="stats-section">
      <div class="stats-hdr" (click)="toggleCollapse()">
        <span class="stats-hdr-title">📊 Statistiques</span>
        <span class="stats-hdr-toggle">{{ collapsed() ? '▶' : '▼' }}</span>
      </div>

      <div class="stats-body" [class.stats-body-collapsed]="collapsed()">
        <div class="stats">
          <div class="stat s1">
            <span class="val">{{ svc.stats().emp }}</span>
            <span class="lbl">Pointages Employé</span>
            <div class="bar"></div>
          </div>
          <div class="stat s2">
            <span class="val">{{ svc.stats().adm }}</span>
            <span class="lbl">Validés Admin</span>
            <div class="bar"></div>
          </div>
          <div class="stat s3">
            <span class="val">{{ svc.stats().companies }}</span>
            <span class="lbl">Compagnies</span>
            <div class="bar"></div>
          </div>
          <div class="stat s4">
            <span class="val">{{ svc.stats().days }}</span>
            <span class="lbl">Jours / Semaine</span>
            <div class="bar"></div>
          </div>
          <div class="stat s5">
            <span class="val earn">
              {{ svc.cumulativeGain() | number:'1.2-2' }}&nbsp;$
            </span>
            <span class="lbl">Gains non validés</span>
            <div class="bar"></div>
          </div>
        </div>

        <!-- Détail par compagnie — visible uniquement si données disponibles -->
        <div class="earn-detail" *ngIf="svc.earnings()?.companies?.length">
          <button class="earn-toggle" (click)="toggleDetail()">
            {{ showDetail() ? '▲' : '▼' }} Détail par compagnie
          </button>
          <div class="earn-rows" *ngIf="showDetail()">
            <div class="earn-row" *ngFor="let co of svc.earnings()!.companies">
              <span class="earn-co">{{ co.companyName }}</span>
              <span class="earn-visits">{{ co.visits }} visite{{ co.visits > 1 ? 's' : '' }}</span>
              <span class="earn-unit" *ngIf="co.unitPrice > 0">{{ co.unitPrice | number:'1.2-2' }}&nbsp;$/v</span>
              <span class="earn-sub">{{ co.subtotal | number:'1.2-2' }}&nbsp;$</span>
            </div>
            <div class="earn-row earn-total">
              <span class="earn-co">Total</span>
              <span class="earn-visits"></span>
              <span class="earn-sub">{{ svc.stats().weekTotal | number:'1.2-2' }}&nbsp;$</span>
            </div>
          </div>
        </div>
      </div><!-- /.stats-body -->
    </div><!-- /.stats-section -->
  `,
  styleUrls: ['./stats-bar.component.scss']
})
export class StatsBarComponent {
  showDetail = signal(false);
  collapsed  = signal(window.innerWidth <= 1023);
  constructor(public svc: SaveStateService) {}
  toggleDetail():   void { this.showDetail.update(v => !v); }
  toggleCollapse(): void { this.collapsed.update(v => !v); }
}
