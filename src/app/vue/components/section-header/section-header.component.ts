import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-section-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sec-hdr">
      <div class="sec-left">
        <div class="sec-icon" [ngClass]="mode">{{ icon }}</div>
        <div>
          <div class="sec-title" [ngClass]="mode">{{ title }}</div>
          <div class="sec-sub">{{ subtitle }}</div>
        </div>
      </div>
      <div class="sec-actions">
        <ng-content></ng-content>
      </div>
    </div>
  `,
  styles: [`
    .sec-hdr {
      display: flex; align-items: flex-start;
      justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;
    }
    .sec-left { display: flex; align-items: center; gap: 12px; }
    .sec-icon {
      width: 36px; height: 36px; border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
      &.employee { background: rgba(201,162,39,.12); border: 1px solid rgba(201,162,39,.25); }
      &.admin    { background: rgba(224,82,82,.12);  border: 1px solid rgba(224,82,82,.25);  }
    }
    .sec-title {
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
      &.employee { color: rgba(201,162,39,.9); }
      &.admin    { color: rgba(224,82,82,.9);  }
    }
    .sec-sub     { font-size: 11px; color: #6278a0; margin-top: 2px; }
    .sec-actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  `]
})
export class SectionHeaderComponent {
  @Input() mode: 'employee' | 'admin' = 'employee';
  @Input() icon     = '📋';
  @Input() title    = '';
  @Input() subtitle = '';
}
