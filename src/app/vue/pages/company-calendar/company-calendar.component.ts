import { Component, OnInit, signal, computed, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CompanyScheduleService, CompanySchedule, CompanyScheduleItem, FREQUENCY_LABEL } from '../../../state/compagny/company-schedule.service';
import { httpErrorMessage } from '../../shared/http-error';
import { locale } from '../../../state/i18n/i18n.service';

interface Cell {
  date:      string;                 // yyyy-MM-dd
  day:       number;
  inMonth:   boolean;
  isToday:   boolean;
  companies: CompanyScheduleItem[];
}


/** yyyy-MM-dd en heure locale. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(d: Date): string { return iso(d).slice(0, 7); }
/** Teinte (0–360), saturation et luminosité (0–100) → [r, g, b] (0–255). */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return [f(0), f(8), f(4)];
}
function parseIso(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d || 1); }

/** Calendrier du mois : les compagnies à travailler chaque jour, d'après leur planning. */
@Component({
  selector: 'app-company-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './company-calendar.component.html',
  styleUrls: ['./company-calendar.component.scss'],
})
export class CompanyCalendarComponent implements OnInit {
  private svc        = inject(CompanyScheduleService);
  private destroyRef = inject(DestroyRef);

  readonly freqLabel = FREQUENCY_LABEL;

  month    = signal(monthKey(new Date()));
  data     = signal<CompanySchedule | null>(null);
  loading  = signal(false);
  error    = signal('');
  search   = signal('');
  /** Jour détaillé sous la grille (par défaut : aujourd'hui, ou le 1er du mois affiché). */
  selected = signal<string>(iso(new Date()));

  readonly todayIso = iso(new Date());

  title = computed(() => { locale(); return parseIso(this.month()).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); });

  /** Lundi → dimanche, dans la langue de l'utilisateur. */
  weekdays = computed(() => {
    locale();
    // Le 1er janvier 2024 est un lundi
    return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: 'short' }));
  });

  /** Compagnie choisie dans la légende : seule affichée (null = toutes). */
  only = signal<string | null>(null);

  /** Compagnies du jour, filtrées par la légende et la recherche (nom ou code). */
  private _filter(list: CompanyScheduleItem[]): CompanyScheduleItem[] {
    const only = this.only();
    const q = this.search().trim().toLocaleLowerCase();
    return list.filter(c => (!only || c.companyId === only)
      && (!q || c.name.toLocaleLowerCase().includes(q) || (c.code ?? '').toLocaleLowerCase().includes(q)));
  }

  /** Toutes les compagnies à travailler dans le mois (légende), triées par nom. */
  monthCompanies = computed<CompanyScheduleItem[]>(() => {
    const seen = new Map<string, CompanyScheduleItem>();
    for (const d of this.data()?.days ?? []) for (const c of d.companies) if (!seen.has(c.companyId)) seen.set(c.companyId, c);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  });

  // ── Employés associés (bulle au survol, liste du jour) ─────────────────
  employeesOf(c: CompanyScheduleItem): string[] { return this.data()?.employees?.[c.companyId] ?? []; }

  employeesLabel(c: CompanyScheduleItem): string {
    const e = this.employeesOf(c);
    return e.length ? e.join(', ') : 'Aucun employé associé';
  }

  tip = signal<{ co: CompanyScheduleItem; x: number; y: number } | null>(null);

  /** Bulle sous la compagnie survolée (position fixe : jamais coupée par le bord de la grille). */
  showTip(co: CompanyScheduleItem, ev: Event): void {
    const r = (ev.target as HTMLElement).getBoundingClientRect();
    const w = 260;
    const x = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 6;
    const y = below + 160 > window.innerHeight ? Math.max(8, r.top - 166) : below;
    this.tip.set({ co, x, y });
  }

  hideTip(): void { this.tip.set(null); }

  toggleOnly(c: CompanyScheduleItem): void { this.only.set(this.only() === c.companyId ? null : c.companyId); }

  // ── Une couleur par compagnie, tirée de son identifiant : la même chaque mois ──
  private _colors = new Map<string, { k: string; rgb: string }>();

  colorOf(c: CompanyScheduleItem): { k: string; rgb: string } {
    let col = this._colors.get(c.companyId);
    if (!col) {
      // FNV-1a sur l'identifiant → teinte (0–359), et deux niveaux de saturation / luminosité pour mieux séparer les teintes proches
      let h = 2166136261;
      for (let i = 0; i < c.companyId.length; i++) { h ^= c.companyId.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      const hue = h % 360;
      const sat = (h >>> 9) % 2 ? 70 : 55;
      const lig = [48, 58, 40][(h >>> 10) % 3];
      const [r, g, b] = hslToRgb(hue, sat, lig);
      col = { k: `rgb(${r}, ${g}, ${b})`, rgb: `${r}, ${g}, ${b}` };
      this._colors.set(c.companyId, col);
    }
    return col;
  }

  /** Semaines complètes (lundi → dimanche) couvrant le mois. */
  cells = computed<Cell[]>(() => {
    const first = parseIso(this.month() + '-01');
    const byDate = new Map((this.data()?.days ?? []).map(d => [d.date, d.companies]));
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
    const last  = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const end   = new Date(last);  end.setDate(last.getDate() + (6 - ((last.getDay() + 6) % 7)));
    const out: Cell[] = [];
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = iso(d);
      const inMonth = d.getMonth() === first.getMonth();
      out.push({ date: key, day: d.getDate(), inMonth, isToday: key === this.todayIso,
                 companies: inMonth ? this._filter(byDate.get(key) ?? []) : [] });
    }
    return out;
  });

  selectedCell = computed(() => this.cells().find(c => c.date === this.selected() && c.inMonth) ?? null);

  /** Total des visites prévues dans le mois (filtre appliqué). */
  monthTotal = computed(() => this.cells().reduce((s, c) => s + c.companies.length, 0));

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const m = this.month();
    this.svc.month(m).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => {
        if (m !== this.month()) return;   // réponse d'un mois quitté entre-temps
        this.data.set(d);
        this.loading.set(false);
        // Compagnie choisie dans la légende absente de ce mois : tout réafficher
        if (this.only() && !this.monthCompanies().some(c => c.companyId === this.only())) this.only.set(null);
      },
      error: err => {
        if (m !== this.month()) return;
        this.loading.set(false);
        this.error.set(httpErrorMessage(err, `Impossible de charger le calendrier`));
      },
    });
  }

  move(delta: number): void {
    const d = parseIso(this.month() + '-01');
    d.setMonth(d.getMonth() + delta);
    const m = monthKey(d);
    // Jour détaillé : aujourd'hui dans le mois courant, sinon le 1er
    this._goto(m, m === this.todayIso.slice(0, 7) ? this.todayIso : iso(d));
  }

  today(): void { this._goto(monthKey(new Date()), this.todayIso); }

  private _goto(m: string, sel: string): void {
    this.selected.set(sel);
    if (m === this.month() && this.data()) return;
    this.month.set(m);
    this.data.set(null);
    this.load();
  }

  select(c: Cell): void { if (c.inMonth) this.selected.set(c.date); }

  dayLabel(date: string): string {
    return parseIso(date).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  trackCell(_: number, c: Cell): string { return c.date; }
  trackCompany(_: number, c: CompanyScheduleItem): string { return c.companyId; }
}
