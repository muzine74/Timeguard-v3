import { Injectable, signal, computed } from '@angular/core';
import { WeekDay } from '../../models';

@Injectable({ providedIn: 'root' })
export class WeekService {
  private _anchor = signal<Date>(this._monday(new Date()));

  readonly anchor   = this._anchor.asReadonly();
  readonly weekKey  = computed(() => this._fmt(this._anchor()));
  readonly weekDays = computed<WeekDay[]>(() => {
    const mon   = this._anchor();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon); d.setDate(mon.getDate() + i);
      return {
        dateKey:    this._fmt(d),
        labelFull:  this._full(d),
        labelShort: this._short(d),
        isToday:    d.getTime() === today.getTime(),
        isWeekend:  d.getDay() === 0 || d.getDay() === 6,
      };
    });
  });
  readonly weekLabel = computed(() => {
    const d = this.weekDays();
    return `Semaine du ${d[0].labelFull} au ${d[6].labelFull}`;
  });

  setDate(d: Date):    void { this._anchor.set(this._monday(d)); }
  shift(days: number): void { const d = new Date(this._anchor()); d.setDate(d.getDate() + days); this._anchor.set(this._monday(d)); }
  goToday():           void { this._anchor.set(this._monday(new Date())); }

  private _monday(d: Date): Date {
    const c = new Date(d); c.setHours(0, 0, 0, 0);
    const day = c.getDay(); c.setDate(c.getDate() + (day === 0 ? -6 : 1 - day));
    return c;
  }
  private _fmt(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  private readonly _D  = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
  private readonly _DF = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  private readonly _M  = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  private _full(d: Date):  string { return `${this._DF[d.getDay()]} ${d.getDate()} ${this._M[d.getMonth()]}`; }
  private _short(d: Date): string { return `${this._D[d.getDay()]} ${d.getDate()}`; }
}
