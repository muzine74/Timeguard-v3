import { Component, ChangeDetectionStrategy, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../state/auth/auth.service';
import { PERM } from '../../../state/auth/permissions';
import {
  CalendarService, CalendarEvent, CalendarEventPayload, CalendarKind, CalendarPerson, CalendarReminder,
  CalendarResponse, CalendarScope, KIND_LABELS, RESPONSE_LABELS, CHANNEL_LABELS, REMINDER_OPTIONS, ReminderChannel,
} from '../../../state/calendar/calendar.service';
import { NotificationsService } from '../../../state/notifications/notifications.service';
import { ConfirmService } from '../../../state/ui/confirm.service';
import { locale } from '../../../state/i18n/i18n.service';
import { MultiSelectComponent, MultiSelectOption } from '../../components/multi-select/multi-select.component';
import { IconComponent } from '../../components/icon/icon.component';
import { httpErrorMessage } from '../../shared/http-error';
import { downloadBlob } from '../../shared/download';

type View = 'month' | 'week' | 'list';

interface DayCell {
  date:    Date;
  key:     string;
  inMonth: boolean;
  isToday: boolean;
  events:  CalendarEvent[];
}

interface EventForm {
  title:         string;
  kind:          CalendarKind;
  allDay:        boolean;
  startDate:     string;
  startTime:     string;
  endDate:       string;
  endTime:       string;
  location:      string;
  description:   string;
  attendeeIds:   string[];
  reminders:     { minutes: number; channel: ReminderChannel }[];
  notifyByEmail: boolean;
}

const VIEW_KEY = 'tg_calendar_view';
/** Vue « Liste » : les 60 jours à partir de la date affichée. */
const LIST_DAYS = 60;
/** Événements montrés dans une case du mois avant « + N autres ». */
const MONTH_CELL_MAX = 3;

const pad = (n: number) => String(n).padStart(2, '0');
/** yyyy-MM-dd en heure locale. */
export function dayKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays    = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Lundi de la semaine de d. */
const mondayOf   = (d: Date) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const parseDay   = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const timeOf     = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

@Component({
  selector: 'app-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MultiSelectComponent, IconComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss'],
})
export class CalendarComponent implements OnInit {
  private readonly api     = inject(CalendarService);
  private readonly auth    = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly notes   = inject(NotificationsService);
  private readonly route   = inject(ActivatedRoute);
  private readonly router  = inject(Router);
  private readonly destroy = inject(DestroyRef);

  readonly kinds        = Object.entries(KIND_LABELS) as [CalendarKind, string][];
  readonly kindLabels   = KIND_LABELS;
  readonly responseLabels = RESPONSE_LABELS;
  readonly channels     = Object.entries(CHANNEL_LABELS) as [ReminderChannel, string][];
  readonly reminderOptions = REMINDER_OPTIONS;

  readonly canManage = computed(() => this.auth.hasPerm(PERM.calendarManage));
  readonly hasEmployee = computed(() => !!this.auth.employeeId());

  // ── État de la vue ─────────────────────────────────────────────────────────
  readonly view    = signal<View>(this.storedView());
  readonly cursor  = signal<Date>(startOfDay(new Date()));
  /** « me » = mon calendrier, « all » = tout le monde, sinon EmployeeId (calendar.manage). */
  readonly scope   = signal<string>('me');
  readonly events  = signal<CalendarEvent[]>([]);
  readonly loading = signal(false);
  readonly error   = signal('');
  readonly message = signal('');
  readonly people  = signal<CalendarPerson[]>([]);
  /** Invitations sans réponse dans les six prochains mois (bandeau). */
  readonly pending = signal<CalendarEvent[]>([]);

  // ── Fenêtre ─────────────────────────────────────────────────────────────────
  readonly selected = signal<CalendarEvent | null>(null);
  readonly editing  = signal(false);
  readonly saving   = signal(false);
  readonly formError = signal('');
  form: EventForm = this.blankForm(new Date());
  private formSnapshot = '';

  readonly peopleOptions = computed<MultiSelectOption[]>(() =>
    this.people().map(p => ({ id: p.employeeId, label: p.hasEmail ? p.name : `${p.name} (sans courriel)` })));

  readonly weekdays = computed(() => {
    locale();
    const monday = mondayOf(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i).toLocaleDateString(locale(), { weekday: 'short' }));
  });

  /** Période chargée pour la vue courante. */
  readonly range = computed(() => {
    const c = this.cursor();
    switch (this.view()) {
      case 'month': {
        const first = new Date(c.getFullYear(), c.getMonth(), 1);
        const from  = mondayOf(first);
        const last  = new Date(c.getFullYear(), c.getMonth() + 1, 0);
        const to    = addDays(mondayOf(last), 7);
        return { from, to };
      }
      case 'week': { const from = mondayOf(c); return { from, to: addDays(from, 7) }; }
      default:     return { from: startOfDay(c), to: addDays(startOfDay(c), LIST_DAYS) };
    }
  });

  readonly title = computed(() => {
    locale();
    const { from, to } = this.range();
    const c = this.cursor();
    if (this.view() === 'month') return c.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
    const last = addDays(to, -1);
    const f = from.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
    const l = last.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
    return `${f} – ${l}`;
  });

  /** Événements par jour (un événement sur plusieurs jours figure chaque jour). */
  private readonly byDay = computed(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of this.events()) {
      const start = new Date(e.startsAt), end = new Date(e.endsAt);
      // Fin exclusive : un événement qui finit à minuit n'apparaît pas le lendemain
      const lastDay = startOfDay(new Date(end.getTime() - 1));
      for (let d = startOfDay(start); d <= lastDay; d = addDays(d, 1)) {
        const k = dayKey(d);
        (map.get(k) ?? map.set(k, []).get(k)!).push(e);
      }
    }
    for (const list of map.values())
      list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt.localeCompare(b.startsAt));
    return map;
  });

  readonly days = computed<DayCell[]>(() => {
    const { from, to } = this.range();
    const month = this.cursor().getMonth();
    const today = dayKey(new Date());
    const map = this.byDay();
    const out: DayCell[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const key = dayKey(d);
      out.push({ date: d, key, inMonth: this.view() !== 'month' || d.getMonth() === month, isToday: key === today, events: map.get(key) ?? [] });
    }
    return out;
  });

  /** Vue liste : seulement les jours qui ont des événements. */
  readonly agenda = computed(() => this.days().filter(d => d.events.length));

  readonly cellMax = MONTH_CELL_MAX;

  ngOnInit(): void {
    if (!this.hasEmployee() && !this.canManage()) {
      this.error.set('Votre compte n\'est pas lié à un employé : le calendrier n\'est pas disponible.');
      return;
    }
    if (!this.hasEmployee()) this.scope.set('all');
    this.load();
    this.loadPending();
    this.api.people().subscribe({ next: p => this.people.set(p), error: () => {} });

    // Lien d'une notification : /calendrier?event=…
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroy)).subscribe(q => {
      const id = q.get('event');
      if (id) this.openById(id);
    });
  }

  // ── Chargement ────────────────────────────────────────────────────────────

  load(): void {
    const { from, to } = this.range();
    this.loading.set(true);
    this.error.set('');
    this.api.list(from, to, this.scopeParam()).subscribe({
      next: list => { this.events.set(list); this.loading.set(false); },
      error: err => { this.error.set(httpErrorMessage(err, 'Impossible de charger le calendrier')); this.loading.set(false); },
    });
  }

  private loadPending(): void {
    if (!this.hasEmployee()) return;
    const from = startOfDay(new Date());
    this.api.list(from, addDays(from, 180)).subscribe({
      next: list => this.pending.set(list.filter(e => e.myResponse === 'pending')),
      error: () => {},
    });
  }

  private scopeParam(): CalendarScope {
    const s = this.scope();
    if (s === 'me') return {};
    if (s === 'all') return { all: true };
    return { employeeId: s };
  }

  private refresh(): void { this.load(); this.loadPending(); }

  // ── Navigation ────────────────────────────────────────────────────────────

  setView(v: View): void {
    this.view.set(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* stockage indisponible */ }
    this.load();
  }

  move(step: -1 | 1): void {
    const c = this.cursor();
    switch (this.view()) {
      case 'month': this.cursor.set(new Date(c.getFullYear(), c.getMonth() + step, 1)); break;
      case 'week':  this.cursor.set(addDays(c, 7 * step)); break;
      default:      this.cursor.set(addDays(c, LIST_DAYS * step)); break;
    }
    this.load();
  }

  today(): void { this.cursor.set(startOfDay(new Date())); this.load(); }

  setScope(s: string): void { this.scope.set(s); this.load(); }

  private storedView(): View {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'month' || v === 'week' || v === 'list') return v;
    } catch { /* stockage indisponible */ }
    return window.innerWidth < 700 ? 'list' : 'month';
  }

  // ── Affichage ─────────────────────────────────────────────────────────────

  timeLabel(e: CalendarEvent): string {
    if (e.allDay) return 'Journée';
    return new Date(e.startsAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  }

  whenLabel(e: CalendarEvent): string {
    const s = new Date(e.startsAt), end = new Date(e.endsAt);
    const day = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const hour = (d: Date) => d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    if (e.allDay) {
      const last = new Date(end.getTime() - 1);
      return dayKey(last) === dayKey(s) ? `${day(s)} · journée entière` : `${day(s)} → ${day(last)}`;
    }
    return dayKey(s) === dayKey(end) ? `${day(s)} · ${hour(s)} – ${hour(end)}` : `${day(s)} ${hour(s)} → ${day(end)} ${hour(end)}`;
  }

  dayLabel(d: Date): string {
    return d.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
  }

  reminderLabel(r: CalendarReminder): string {
    const known = REMINDER_OPTIONS.find(o => o.minutes === r.minutesBefore)?.label ?? `${r.minutesBefore} minutes avant`;
    return `${known} · ${CHANNEL_LABELS[r.channel]}`;
  }

  /** Nombre de participants par réponse : « 2 acceptés · 1 sans réponse ». */
  responseSummary(e: CalendarEvent): string {
    const count = (r: CalendarResponse) => e.attendees.filter(a => a.response === r).length;
    return (['accepted', 'tentative', 'declined', 'pending'] as CalendarResponse[])
      .filter(r => count(r)).map(r => `${count(r)} ${RESPONSE_LABELS[r].toLowerCase()}`).join(' · ');
  }

  trackEvent(_: number, e: CalendarEvent): string { return e.id; }
  trackDay(_: number, d: DayCell): string { return d.key; }

  // ── Fenêtre : consultation ────────────────────────────────────────────────

  open(e: CalendarEvent): void {
    this.selected.set(e);
    this.editing.set(false);
    this.formError.set('');
  }

  private openById(id: string): void {
    this.api.get(id).subscribe({
      next: e => {
        this.cursor.set(startOfDay(new Date(e.startsAt)));
        this.load();
        this.open(e);
      },
      error: err => this.error.set(httpErrorMessage(err, 'Événement introuvable (supprimé ou retiré de votre calendrier)')),
    });
    // L'adresse redevient /calendrier : un rechargement ne rouvre pas la fenêtre
    this.router.navigate([], { relativeTo: this.route, queryParams: { event: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  async close(): Promise<void> {
    if (this.editing() && this.isDirty() && !await this.confirm.discard('Les changements de cet événement seront perdus.')) return;
    this.selected.set(null);
    this.editing.set(false);
  }

  respond(e: CalendarEvent, response: Exclude<CalendarResponse, 'pending'>): void {
    this.api.respond(e.id, response).subscribe({
      next: r => {
        if (r.event && this.selected()?.id === e.id) this.selected.set(r.event);
        this.flash(`Réponse envoyée : ${RESPONSE_LABELS[response].toLowerCase()}.`);
        this.refresh();
        this.notes.poll();
      },
      error: err => this.error.set(httpErrorMessage(err, 'Impossible d\'envoyer la réponse')),
    });
  }

  downloadIcs(e: CalendarEvent): void {
    this.api.ics(e.id).subscribe({
      next: blob => downloadBlob(blob, `${(e.title || 'evenement').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.ics`),
      error: err => this.error.set(httpErrorMessage(err, 'Impossible de télécharger l\'événement')),
    });
  }

  async remove(e: CalendarEvent): Promise<void> {
    const invited = e.attendees.length;
    const ok = await this.confirm.danger(`Supprimer « ${e.title} » ?`,
      invited ? `Les ${invited} participant(s) seront prévenus de l'annulation (notification et courriel).` : undefined);
    if (!ok) return;
    this.api.delete(e.id, true).subscribe({
      next: r => {
        this.selected.set(null);
        this.flash(r.warning ? `Événement supprimé. ${r.warning}` : 'Événement supprimé.');
        this.refresh();
      },
      error: err => this.error.set(httpErrorMessage(err, 'Impossible de supprimer l\'événement')),
    });
  }

  // ── Fenêtre : saisie ──────────────────────────────────────────────────────

  create(day?: Date): void {
    if (!this.hasEmployee()) return;
    this.form = this.blankForm(day ?? this.cursor());
    this.startEditing(null);
  }

  edit(e: CalendarEvent): void {
    const s = new Date(e.startsAt), end = new Date(e.endsAt);
    const lastDay = e.allDay ? new Date(end.getTime() - 1) : end;
    this.form = {
      title: e.title, kind: e.kind, allDay: e.allDay,
      startDate: dayKey(s), startTime: e.allDay ? '09:00' : timeOf(s),
      endDate: dayKey(lastDay), endTime: e.allDay ? '10:00' : timeOf(end),
      location: e.location ?? '', description: e.description ?? '',
      attendeeIds: e.attendees.map(a => a.employeeId),
      reminders: e.reminders.map(r => ({ minutes: r.minutesBefore, channel: r.channel })),
      notifyByEmail: true,
    };
    // Participants déjà invités mais absents de la liste proposée (ex. autre équipe) : gardés et affichés
    const known = new Set(this.people().map(p => p.employeeId));
    const extra = e.attendees.filter(a => !known.has(a.employeeId))
      .map(a => ({ employeeId: a.employeeId, name: a.name, hasEmail: a.hasEmail }));
    if (extra.length) this.people.update(list => [...list, ...extra].sort((a, b) => a.name.localeCompare(b.name)));
    this.startEditing(e);
  }

  private startEditing(e: CalendarEvent | null): void {
    this.selected.set(e);
    this.editing.set(true);
    this.formError.set('');
    this.formSnapshot = JSON.stringify(this.form);
    setTimeout(() => (document.getElementById('cal-title') as HTMLInputElement | null)?.focus());
  }

  private isDirty(): boolean { return JSON.stringify(this.form) !== this.formSnapshot; }

  private blankForm(day: Date): EventForm {
    const now = new Date();
    const isToday = dayKey(day) === dayKey(now);
    const startHour = isToday ? Math.min(now.getHours() + 1, 23) : 9;
    return {
      title: '', kind: 'event', allDay: false,
      startDate: dayKey(day), startTime: `${pad(startHour)}:00`,
      endDate: dayKey(day), endTime: `${pad(Math.min(startHour + 1, 23))}:${startHour + 1 > 23 ? '59' : '00'}`,
      location: '', description: '', attendeeIds: [],
      reminders: [{ minutes: 15, channel: 'app' }], notifyByEmail: true,
    };
  }

  /** Début modifié : la fin suit pour garder une durée positive. */
  onStartChange(): void {
    const f = this.form;
    if (!f.startDate) return;
    if (!f.endDate || f.endDate < f.startDate) f.endDate = f.startDate;
    if (!f.allDay && f.endDate === f.startDate && f.endTime <= f.startTime) {
      const [h, m] = f.startTime.split(':').map(Number);
      const end = new Date(2000, 0, 1, h + 1, m);
      f.endTime = end.getDate() === 1 ? timeOf(end) : '23:59';
    }
  }

  addReminder(): void {
    const used = new Set(this.form.reminders.map(r => r.minutes));
    const next = REMINDER_OPTIONS.find(o => !used.has(o.minutes))?.minutes ?? 60;
    this.form.reminders = [...this.form.reminders, { minutes: next, channel: 'app' }];
  }

  removeReminder(i: number): void { this.form.reminders = this.form.reminders.filter((_, j) => j !== i); }

  attendeeName(id: string): string { return this.people().find(p => p.employeeId === id)?.name ?? '—'; }
  attendeeHasEmail(id: string): boolean { return this.people().find(p => p.employeeId === id)?.hasEmail ?? false; }
  removeAttendee(id: string): void { this.form.attendeeIds = this.form.attendeeIds.filter(a => a !== id); }

  private payload(): CalendarEventPayload | string {
    const f = this.form;
    if (!f.title.trim()) return 'Le titre est obligatoire.';
    if (!f.startDate || !f.endDate) return 'Indiquez les dates de début et de fin.';
    let start: Date, end: Date;
    if (f.allDay) {
      start = parseDay(f.startDate);
      end   = addDays(parseDay(f.endDate), 1);   // fin exclusive : lendemain du dernier jour
    } else {
      if (!f.startTime || !f.endTime) return 'Indiquez les heures de début et de fin.';
      const [sh, sm] = f.startTime.split(':').map(Number);
      const [eh, em] = f.endTime.split(':').map(Number);
      const sd = parseDay(f.startDate), ed = parseDay(f.endDate);
      start = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate(), sh, sm);
      end   = new Date(ed.getFullYear(), ed.getMonth(), ed.getDate(), eh, em);
    }
    if (end <= start) return 'La fin doit être après le début.';
    return {
      title: f.title.trim(), kind: f.kind, allDay: f.allDay,
      startsAt: start.toISOString(), endsAt: end.toISOString(),
      location: f.location.trim() || null, description: f.description.trim() || null,
      attendeeIds: f.attendeeIds,
      reminders: f.reminders.map(r => ({ minutesBefore: Number(r.minutes), channel: r.channel })),
      notifyByEmail: f.notifyByEmail,
    };
  }

  save(): void {
    const p = this.payload();
    if (typeof p === 'string') { this.formError.set(p); return; }
    const current = this.selected();
    this.saving.set(true);
    this.formError.set('');
    const req = current ? this.api.update(current.id, p) : this.api.create(p);
    req.subscribe({
      next: r => {
        this.saving.set(false);
        this.editing.set(false);
        this.selected.set(r.event);
        const done = current ? 'Événement modifié.' : (p.attendeeIds.length ? 'Événement créé, invitations envoyées.' : 'Événement créé.');
        this.flash(r.warning ? `${done} ${r.warning}` : done, !!r.warning);
        if (r.event) this.cursor.set(startOfDay(new Date(r.event.startsAt)));
        this.refresh();
      },
      error: err => { this.saving.set(false); this.formError.set(httpErrorMessage(err, 'Enregistrement impossible')); },
    });
  }

  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private flash(text: string, keep = false): void {
    this.message.set(text);
    if (this.flashTimer) clearTimeout(this.flashTimer);
    if (!keep) this.flashTimer = setTimeout(() => this.message.set(''), 6000);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.selected() || this.editing()) this.close(); }
}
