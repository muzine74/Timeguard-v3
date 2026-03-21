import { Component, Output, EventEmitter, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeekService } from '../../../state/pointage/pointage.service';

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './date-picker.component.html',
  styleUrls: ['./date-picker.component.scss'],
})
export class DatePickerComponent {
  @Output() weekChange = new EventEmitter<Date>();

  months = ['Janvier','Février','Mars','Avril','Mai','Juin',
            'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  days   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

  constructor(public svc: WeekService) {}

  get d()         { return this.svc.anchor(); }
  get dayName()   { return this.days[this.d.getDay()]; }
  get monthName() { return this.months[this.d.getMonth()]; }
  get weekLabel() { return this.svc.weekLabel(); }

  // Lundi de la semaine courante (max autorisé)
  private _currentWeekStart(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    today.setDate(today.getDate() + diff);
    return today;
  }

  // Vrai si la semaine affichée est déjà la semaine courante
  get isCurrentWeek(): boolean {
    return this.svc.anchor().getTime() >= this._currentWeekStart().getTime();
  }

  private _clamp(d: Date): Date {
    const max = this._currentWeekStart();
    return d > max ? max : d;
  }

  private emit(d: Date): void {
    const clamped = this._clamp(d);
    this.svc.setDate(clamped);
    this.weekChange.emit(clamped);
  }

  setDay(v: number):   void { const d = new Date(this.d); d.setDate(v);     this.emit(d); }
  setMonth(v: number): void { const d = new Date(this.d); d.setMonth(v);    this.emit(d); }
  setYear(v: number):  void { const d = new Date(this.d); d.setFullYear(v); this.emit(d); }

  prevWeek(): void { this.svc.shift(-7); this.weekChange.emit(this.svc.anchor()); }

  nextWeek(): void {
    if (this.isCurrentWeek) return;  // bloqué — déjà à la semaine max
    this.svc.shift(7);
    // Re-vérifier après le shift
    if (this.svc.anchor() > this._currentWeekStart()) {
      this.svc.setDate(this._currentWeekStart());
    }
    this.weekChange.emit(this.svc.anchor());
  }

  today(): void { this.svc.goToday(); this.weekChange.emit(this.svc.anchor()); }
}