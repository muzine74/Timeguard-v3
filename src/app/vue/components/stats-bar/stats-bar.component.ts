import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SaveStateService } from '../../../state/pointage/pointage.service';

@Component({
  selector: 'app-stats-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
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
    </div>
  `,
  styleUrls: ['./stats-bar.component.scss']
})
export class StatsBarComponent {
  constructor(public svc: SaveStateService) {}
}
