import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

/** Type d'événement : événement personnel, rendez-vous ou rencontre (avec participants). */
export type CalendarKind = 'event' | 'appointment' | 'meeting';
/** Réponse d'un participant. */
export type CalendarResponse = 'pending' | 'accepted' | 'tentative' | 'declined';
/** Canal d'un rappel : notification dans TimeGuard, courriel, ou les deux. */
export type ReminderChannel = 'app' | 'email' | 'both';

export const KIND_LABELS: Record<CalendarKind, string> = {
  event:       'Événement',
  appointment: 'Rendez-vous',
  meeting:     'Rencontre',
};

export const RESPONSE_LABELS: Record<CalendarResponse, string> = {
  pending:   'Sans réponse',
  accepted:  'Accepté',
  tentative: 'Peut-être',
  declined:  'Refusé',
};

export const CHANNEL_LABELS: Record<ReminderChannel, string> = {
  app:   'Notification',
  email: 'Courriel',
  both:  'Notification et courriel',
};

/** Délais de rappel proposés (minutes avant le début). */
export const REMINDER_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 0,     label: 'Au début' },
  { minutes: 5,     label: '5 minutes avant' },
  { minutes: 15,    label: '15 minutes avant' },
  { minutes: 30,    label: '30 minutes avant' },
  { minutes: 60,    label: '1 heure avant' },
  { minutes: 120,   label: '2 heures avant' },
  { minutes: 1440,  label: '1 jour avant' },
  { minutes: 2880,  label: '2 jours avant' },
  { minutes: 10080, label: '1 semaine avant' },
];

export interface CalendarAttendee {
  employeeId:  string;
  name:        string;
  response:    CalendarResponse;
  respondedAt: string | null;
  /** Faux : l'employé n'a pas d'adresse courriel (notifications dans TimeGuard seulement). */
  hasEmail:    boolean;
}

export interface CalendarReminder {
  minutesBefore: number;
  channel:       ReminderChannel;
}

export interface CalendarEvent {
  id:            string;
  title:         string;
  description:   string | null;
  location:      string | null;
  kind:          CalendarKind;
  /** ISO UTC. */
  startsAt:      string;
  endsAt:        string;
  allDay:        boolean;
  organizerId:   string;
  organizerName: string;
  attendees:     CalendarAttendee[];
  reminders:     CalendarReminder[];
  isOrganizer:   boolean;
  /** Réponse de l'utilisateur connecté s'il est invité. */
  myResponse:    CalendarResponse | null;
  canEdit:       boolean;
}

export interface CalendarEventPayload {
  title:         string;
  description:   string | null;
  location:      string | null;
  kind:          CalendarKind;
  startsAt:      string;
  endsAt:        string;
  allDay:        boolean;
  attendeeIds:   string[];
  reminders:     CalendarReminder[];
  notifyByEmail: boolean;
}

export interface CalendarPerson {
  employeeId: string;
  name:       string;
  hasEmail:   boolean;
}

/** Résultat d'un enregistrement : l'événement, et un avertissement si un courriel n'a pas pu partir. */
export interface CalendarSaveResult {
  event:   CalendarEvent | null;
  warning: string | null;
}

/** Calendrier vu : le sien, celui d'un employé ou celui de tout le monde (« calendar.manage »). */
export interface CalendarScope {
  employeeId?: string | null;
  all?:        boolean;
}

@Injectable({ providedIn: 'root' })
export class CalendarService {
  constructor(private http: HttpClient) {}

  list(from: Date, to: Date, scope: CalendarScope = {}) {
    let params = new HttpParams().set('from', from.toISOString()).set('to', to.toISOString());
    if (scope.all) params = params.set('all', 'true');
    else if (scope.employeeId) params = params.set('employeeId', scope.employeeId);
    return this.http.get<CalendarEvent[]>('/api/calendar/events', { params });
  }

  get(id: string) {
    return this.http.get<CalendarEvent>(`/api/calendar/events/${id}`);
  }

  people() {
    return this.http.get<CalendarPerson[]>('/api/calendar/people');
  }

  create(payload: CalendarEventPayload) {
    return this.http.post<CalendarSaveResult>('/api/calendar/events', payload);
  }

  update(id: string, payload: CalendarEventPayload) {
    return this.http.put<CalendarSaveResult>(`/api/calendar/events/${id}`, payload);
  }

  delete(id: string, notify: boolean) {
    return this.http.delete<CalendarSaveResult>(`/api/calendar/events/${id}`, { params: { notify: String(notify) } });
  }

  respond(id: string, response: Exclude<CalendarResponse, 'pending'>) {
    return this.http.post<CalendarSaveResult>(`/api/calendar/events/${id}/respond`, { response });
  }

  ics(id: string) {
    return this.http.get(`/api/calendar/events/${id}/ics`, { responseType: 'blob' });
  }
}
