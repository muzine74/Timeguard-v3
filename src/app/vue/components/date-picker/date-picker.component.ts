import { Component, Output, EventEmitter } from '@angular/core';
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

  private emit(d: Date): void { this.svc.setDate(d); this.weekChange.emit(d); }

  setDay(v: number):   void { const d = new Date(this.d); d.setDate(v);     this.emit(d); }
  setMonth(v: number): void { const d = new Date(this.d); d.setMonth(v);    this.emit(d); }
  setYear(v: number):  void { const d = new Date(this.d); d.setFullYear(v); this.emit(d); }

  prevWeek(): void { this.svc.shift(-7); this.weekChange.emit(this.svc.anchor()); }
  nextWeek(): void { this.svc.shift(7); this.weekChange.emit(this.svc.anchor()); }
  today():    void { this.svc.goToday();     this.weekChange.emit(this.svc.anchor()); }
}
