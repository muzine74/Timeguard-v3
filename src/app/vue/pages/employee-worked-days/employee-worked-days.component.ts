import { Component, DestroyRef, HostListener, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, map } from 'rxjs';
import { EmployeesService } from '../../../state/employees/employees.service';
import { MultiSelectComponent, MultiSelectOption } from '../../components/multi-select/multi-select.component';
import { todayIso } from '../../shared/dates';
import {
  EmployeePaymentsService, EmployeePaymentWeek, EmployeePaymentWorkDay, EmployeePaymentHistoryItem, EmployeePaymentInstallment,
} from '../../../state/employee-payments/employee-payments.service';

type FilterMode = 'period' | 'range';

/** État à l'écran d'une semaine validée d'un employé. */
interface WeekState extends EmployeePaymentWeek {
  key: string;                  // employé + lundi (unique sur la page)
  employeeId: string;
  /** Versements déjà enregistrés pour la semaine (du plus ancien au plus récent). */
  payments: EmployeePaymentInstallment[];
  selected: Set<string>;        // dates (yyyy-MM-dd) cochées
  // ── Nouveau versement (formulaire) ──
  /** Montant avant taxes saisi ; null = le reste à verser. */
  realAmount: number | null;
  noteText: string;
  /** Date de paiement choisie (yyyy-MM-dd) — aujourd'hui par défaut. */
  payDate: string;
  /** Case « Paiement transféré » du nouveau versement. */
  transferred: boolean;
  /** Le montant saisi dépassait le plafond et a été ramené au reste à verser. */
  capped: boolean;
  saving: boolean;
  saveMsg: string;
  saveError: boolean;
  // ── Actions sur un versement existant ──
  confirmDeleteId: string | null;   // annulation en 2 clics
  busyId: string | null;
  // Historique des enregistrements (chargé à l'ouverture du panneau)
  historyOpen: boolean;
  historyLoading: boolean;
  historyError: string;
  history: EmployeePaymentHistoryItem[] | null;
}

/** Semaines d'un employé + ses totaux. */
interface EmployeeGroup {
  employeeId: string;
  name: string;
  weeks: WeekState[];
  selectedTotal: number;
  transferred: number;
  toTransfer: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Paiements employés : pour chaque employé choisi, ses semaines VALIDÉES. Une semaine se paie en un ou
 * plusieurs VERSEMENTS : journées cochées (= total sélectionné), montant avant taxes plafonné au reste à
 * verser, taxes de l'employé, date de paiement, case « Paiement transféré », historique.
 */
@Component({
    selector: 'app-employee-worked-days',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, MultiSelectComponent],
    templateUrl: './employee-worked-days.component.html',
    styleUrls: ['./employee-worked-days.component.scss']
})
export class EmployeeWorkedDaysComponent {
  mode: FilterMode = 'period';
  period   = this._currentPeriod();
  dateFrom = todayIso();
  dateTo   = todayIso();
  /** Employés cochés dans le filtre. */
  selectedEmployees: string[] = [];

  /** Actifs d'abord, puis désactivés (un ancien employé peut encore avoir des semaines à payer). */
  employeeOptions = computed<MultiSelectOption[]>(() => [...this.employeesSvc.list()]
    .sort((a, b) => Number(!!b.isActive) - Number(!!a.isActive) || a.employeeName.localeCompare(b.employeeName, 'fr'))
    .map(e => ({ id: e.employeeId, label: e.employeeName + (e.isActive ? '' : ' (désactivé)') })));

  loading = signal(false);
  loaded  = signal(false);
  error   = signal('');
  weeks   = signal<WeekState[]>([]);
  /** Employés chargés (dans l'ordre alphabétique), même sans semaine validée. */
  private _loadedEmployees = signal<{ id: string; name: string }[]>([]);
  /** Période réellement affichée (celle du dernier chargement). */
  private _shownRange = signal<{ from: string; to: string } | null>(null);
  /** Blocs employé DÉPLIÉS (repliés par défaut). */
  openGroups = signal<ReadonlySet<string>>(new Set());
  /** Semaines DÉPLIÉES, par clé employé + lundi (repliées par défaut). */
  openWeeks  = signal<ReadonlySet<string>>(new Set());

  groups = computed<EmployeeGroup[]>(() => {
    const ws = this.weeks();
    return this._loadedEmployees().map(e => {
      const weeks = ws.filter(w => w.employeeId === e.id);
      return {
        employeeId: e.id, name: e.name, weeks,
        selectedTotal: round2(weeks.reduce((t, w) => t + this.selectedTotal(w), 0)),
        // Montants réellement transférés = avec les taxes de l'employé
        transferred:   round2(weeks.reduce((t, w) => t + this.transferredTotal(w), 0)),
        toTransfer:    round2(weeks.reduce((t, w) => t + this.pendingTotal(w) + this.remainingWithTaxes(w), 0)),
      };
    });
  });

  /** Totaux de la page (toutes les semaines affichées). */
  summary = computed(() => {
    const gs = this.groups();
    return {
      employees:   gs.length,
      weeks:       this.weeks().length,
      selected:    round2(gs.reduce((t, g) => t + g.selectedTotal, 0)),
      transferred: round2(gs.reduce((t, g) => t + g.transferred, 0)),
      toTransfer:  round2(gs.reduce((t, g) => t + g.toTransfer, 0)),
    };
  });

  private destroyRef = inject(DestroyRef);
  private _autoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public  employeesSvc: EmployeesService,
    private paymentsSvc:  EmployeePaymentsService,
  ) {
    this.employeesSvc.loadList(false);
  }

  // ── Filtres ────────────────────────────────────────────────────────────────
  setMode(m: FilterMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.autoLoad();
  }

  setEmployees(ids: string[]): void {
    this.selectedEmployees = ids;
    this.autoLoad();
  }

  /** Recharge (avec un court délai pendant la saisie) dès que les employés et la période sont valides. */
  autoLoad(): void {
    if (this._autoTimer) clearTimeout(this._autoTimer);
    this._autoTimer = setTimeout(() => { this._autoTimer = null; this.load(); }, 400);
  }

  private _periodDates(): { from: string; to: string } | null {
    if (this.mode === 'period') {
      if (!/^\d{4}-\d{2}$/.test(this.period ?? '')) return null;
      const [y, m] = this.period.split('-').map(Number);
      return { from: `${this.period}-01`, to: `${this.period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
    }
    if (!this.dateFrom || !this.dateTo) return null;
    return { from: this.dateFrom, to: this.dateTo };
  }

  /**
   * Retour sur l'onglet : les paiements ont pu changer ailleurs (ex. Suppression définitive) → rechargement
   * automatique, sauf si un versement est en cours de saisie ou d'enregistrement (rien n'est perdu).
   */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState !== 'visible' || !this.loaded() || this.loading()) return;
    if (this.weeks().some(w => w.saving || w.busyId || w.realAmount !== null || w.noteText.trim())) return;
    this.load(true);
  }

  /** <paramref name="keepHistory"/> : les panneaux d'historique ouverts le restent et sont rechargés. */
  load(keepHistory = false): void {
    const range = this._periodDates();
    const ids = [...this.selectedEmployees];
    if (!ids.length) { this.weeks.set([]); this._loadedEmployees.set([]); this.loaded.set(false); this.error.set(''); return; }
    if (!range) return;
    if (range.from > range.to) { this.error.set('La date de début doit être avant la date de fin.'); return; }

    const names = new Map(this.employeeOptions().map(o => [o.id, o.label]));
    this.error.set('');
    this.loading.set(true);
    forkJoin(ids.map(id => this.paymentsSvc.getValidatedWeeks(id, range.from, range.to).pipe(map(list => ({ id, list })))))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: results => {
          this._loadedEmployees.set(ids
            .map(id => ({ id, name: names.get(id) ?? 'Employé' }))
            .sort((a, b) => a.name.localeCompare(b.name, 'fr')));
          const openHistory = new Set(keepHistory ? this.weeks().filter(w => w.historyOpen).map(w => w.key) : []);
          this._shownRange.set(range);
          this.weeks.set(results.flatMap(r => r.list.map(w => this._toState(r.id, w)))
            // Une semaine sans aucune journée (ni versement) dans la période n'a rien à montrer ici
            .filter(w => this.periodDays(w).length > 0 || this.visiblePayments(w).length > 0)
            .map(w => openHistory.has(w.key) ? { ...w, historyOpen: true } : w));
          this.loading.set(false);
          this.loaded.set(true);
          this.weeks().filter(w => w.historyOpen).forEach(w => this._loadHistory(w));
        },
        error: err => {
          this.weeks.set([]);
          this._loadedEmployees.set([]);
          this.loading.set(false);
          this.error.set(err?.error?.message ?? `Impossible de charger les paiements (HTTP ${err?.status ?? '?'}).`);
        },
      });
  }

  private _toState(employeeId: string, w: EmployeePaymentWeek): WeekState {
    // Seules les journées DE LA PÉRIODE affichée sont cochables. Journées déjà couvertes par un versement :
    // cochées, les autres non. Aucun versement sur la période : toutes cochées.
    const dates = w.workDays.map(d => d.date).filter(d => this._inPeriod(d));
    const paid = new Set((w.payments ?? []).flatMap(p => Object.entries(p.byDay ?? {}).filter(([, a]) => a > 0).map(([d]) => d)));
    const covered = dates.filter(d => paid.has(d));
    const selected = new Set(covered.length ? covered : dates);
    return {
      ...w, employeeId, key: `${employeeId}|${w.weekStart}`, selected,
      payments: w.payments ?? [],
      realAmount: null, noteText: '', payDate: todayIso(), transferred: false, capped: false,
      saving: false, saveMsg: '', saveError: false,
      confirmDeleteId: null, busyId: null,
      historyOpen: false, historyLoading: false, historyError: '', history: null,
    };
  }

  // ── Blocs employé ──────────────────────────────────────────────────────────
  isCollapsed(id: string): boolean { return !this.openGroups().has(id); }

  toggleGroup(id: string): void {
    const next = new Set(this.openGroups());
    next.has(id) ? next.delete(id) : next.add(id);
    this.openGroups.set(next);
  }

  // ── Semaines (repliées par défaut) ─────────────────────────────────────────
  isWeekOpen(w: WeekState): boolean { return this.openWeeks().has(w.key); }

  toggleWeek(w: WeekState): void {
    const next = new Set(this.openWeeks());
    next.has(w.key) ? next.delete(w.key) : next.add(w.key);
    this.openWeeks.set(next);
  }

  // ── Sélection des journées ─────────────────────────────────────────────────
  /** Modifie une semaine ; le message d'enregistrement est effacé sauf s'il est fourni. */
  private _patch(w: WeekState, changes: Partial<WeekState>): void {
    this.weeks.update(ws => ws.map(x => x.key === w.key ? { ...x, ...changes, saveMsg: changes.saveMsg ?? '' } : x));
  }

  private _current(w: WeekState): WeekState {
    return this.weeks().find(x => x.key === w.key) ?? w;
  }

  isSelected(w: WeekState, d: EmployeePaymentWorkDay): boolean { return w.selected.has(d.date); }

  private _inPeriod(date: string): boolean {
    const r = this._shownRange();
    return !r || (date >= r.from && date <= r.to);
  }

  /** Journée hors de la période affichée (une semaine validée peut déborder sur le mois voisin) :
   *  grisée, barrée, non cochable et exclue de tous les calculs. */
  isOutOfPeriod(d: EmployeePaymentWorkDay): boolean { return !this._inPeriod(d.date); }

  /** Journées de la semaine qui tombent dans la période affichée. */
  periodDays(w: WeekState): EmployeePaymentWorkDay[] { return w.workDays.filter(d => this._inPeriod(d.date)); }
  periodTotal(w: WeekState): number { return round2(this.periodDays(w).reduce((t, d) => t + d.amount, 0)); }

  /** Clic sur une journée : sélectionnée ↔ non sélectionnée. Le montant du versement revient au reste à verser. */
  toggleDay(w: WeekState, d: EmployeePaymentWorkDay): void {
    if (this.isOutOfPeriod(d)) return;
    const selected = new Set(w.selected);
    selected.has(d.date) ? selected.delete(d.date) : selected.add(d.date);
    this._patch(w, { selected, realAmount: null, capped: false });
  }

  allSelected(w: WeekState): boolean  { const n = this.periodDays(w).length; return n > 0 && w.selected.size === n; }
  someSelected(w: WeekState): boolean { return w.selected.size > 0 && !this.allSelected(w); }

  /** « Tout sélectionner » : coche toutes les journées de la période, ou les décoche si elles le sont toutes. */
  toggleAll(w: WeekState): void {
    this._patch(w, { selected: this.allSelected(w) ? new Set() : new Set(this.periodDays(w).map(d => d.date)), realAmount: null, capped: false });
  }

  /** Total sélectionné : journées cochées, toutes dans la période affichée. */
  selectedTotal(w: WeekState): number {
    return round2(this.periodDays(w).filter(d => w.selected.has(d.date)).reduce((t, d) => t + d.amount, 0));
  }

  // ── Versements déjà enregistrés ────────────────────────────────────────────
  /** Part d'un versement (avant taxes) qui porte sur les journées données. Sans répartition connue : tout le versement. */
  private _share(p: EmployeePaymentInstallment, keep: (date: string) => boolean): number {
    if (!p.byDay) return p.amount;
    return Object.entries(p.byDay).reduce((t, [date, amount]) => t + (keep(date) ? amount : 0), 0);
  }

  /** Part du versement qui porte sur des journées de la période affichée (avant taxes). */
  periodShare(p: EmployeePaymentInstallment): number { return round2(this._share(p, d => this._inPeriod(d))); }
  /** Même part, de 0 à 1 (sert à ramener les taxes et le montant transféré à la période). */
  private _periodRatio(p: EmployeePaymentInstallment): number { return p.amount ? this._share(p, d => this._inPeriod(d)) / p.amount : 0; }
  /** Le versement couvre aussi des journées hors de la période affichée. */
  isSplit(p: EmployeePaymentInstallment): boolean { return this.periodShare(p) < round2(p.amount); }

  /** Versements qui concernent la période affichée (ceux des seules journées hors période ne sont pas listés). */
  visiblePayments(w: WeekState): EmployeePaymentInstallment[] { return w.payments.filter(p => this.periodShare(p) > 0); }

  /** Déjà versé (avant taxes) pour les journées cochées : part des versements, transférés ou non, sur ces journées. */
  paidAmount(w: WeekState): number { return round2(w.payments.reduce((t, p) => t + this._share(p, d => w.selected.has(d)), 0)); }
  /** Même calcul, limité aux versements marqués « transférés » : baisse dès qu'un versement est remis « à transférer ». */
  transferredAmount(w: WeekState): number {
    return round2(w.payments.filter(p => p.isTransferred).reduce((t, p) => t + this._share(p, d => w.selected.has(d)), 0));
  }
  /** Montants réellement transférés (avec taxes), pour la part des journées de la période. */
  transferredTotal(w: WeekState): number {
    return round2(w.payments.filter(p => p.isTransferred).reduce((t, p) => t + p.total * this._periodRatio(p), 0));
  }
  /** Versements enregistrés mais pas encore transférés (avec taxes), pour la part des journées de la période. */
  pendingTotal(w: WeekState): number {
    return round2(w.payments.filter(p => !p.isTransferred).reduce((t, p) => t + p.total * this._periodRatio(p), 0));
  }

  /** Reste à verser (avant taxes) = total sélectionné − déjà versé ; jamais négatif. */
  remaining(w: WeekState): number { return Math.max(0, round2(this.selectedTotal(w) - this.paidAmount(w))); }
  /** Trop versé : les versements dépassent le total des journées cochées (journées décochées après coup). */
  overpaid(w: WeekState): number { return Math.max(0, round2(this.paidAmount(w) - this.selectedTotal(w))); }
  remainingWithTaxes(w: WeekState): number {
    const r = this.remaining(w);
    return round2(r + this._tax(r, w.tpsRate ?? 0) + this._tax(r, w.tvqRate ?? 0));
  }

  hasPayments(w: WeekState): boolean { return this.visiblePayments(w).length > 0; }
  /** Soldée pour la période : tout le total sélectionné est versé, et chaque versement concerné est transféré. */
  isSettled(w: WeekState): boolean {
    return this.hasPayments(w) && this.remaining(w) === 0 && this.visiblePayments(w).every(p => p.isTransferred);
  }

  // ── Nouveau versement : montant avant taxes, plafonné ──────────────────────
  /** Plafond = reste à verser (il ne dépasse jamais le total sélectionné). */
  maxAmount(w: WeekState): number { return this.remaining(w); }

  /** Montant avant taxes du nouveau versement : le reste à verser tant que rien n'est saisi. */
  realAmount(w: WeekState): number { return Math.min(w.realAmount ?? this.remaining(w), this.maxAmount(w)); }

  /** Versement partiel = inférieur au reste à verser. */
  isPartial(w: WeekState): boolean { return this.realAmount(w) < this.remaining(w); }

  onAmountInput(w: WeekState, value: string | number | null, input?: HTMLInputElement): void {
    const n = value === '' || value == null ? null : Number(value);
    if (n == null || isNaN(n)) { this._patch(w, { realAmount: null, capped: false }); return; }
    const max = this.maxAmount(w);
    const capped = round2(n) > max;      // jamais plus que le total sélectionné ni que le reste à verser
    this._patch(w, { realAmount: capped ? max : Math.max(0, round2(n)), capped });
    // Le champ doit montrer le montant réellement retenu (la valeur liée peut ne pas avoir changé)
    if (capped && input) input.value = String(max);
  }

  resetAmount(w: WeekState): void { this._patch(w, { realAmount: null, capped: false }); }

  setNote(w: WeekState, text: string): void { this._patch(w, { noteText: text, capped: w.capped }); }

  /** Versement partiel sans raison saisie → enregistrement bloqué. */
  reasonMissing(w: WeekState): boolean { return this.isPartial(w) && !w.noteText.trim(); }

  diffLabel(w: WeekState): string {
    return `${this.fmt(round2(this.remaining(w) - this.realAmount(w)))} de moins que le reste à verser`;
  }

  // ── Taxes de l'employé (s'il a un numéro TPS / TVQ) ────────────────────────
  /** Taxe arrondie au cent (0,5 → au-dessus, comme le serveur). */
  private _tax(amount: number, ratePercent: number): number {
    return Math.round(amount * ratePercent + 1e-9) / 100;
  }

  hasTaxes(w: WeekState): boolean { return (w.tpsRate ?? 0) > 0 || (w.tvqRate ?? 0) > 0; }
  tps(w: WeekState): number { return this._tax(this.realAmount(w), w.tpsRate ?? 0); }
  tvq(w: WeekState): number { return this._tax(this.realAmount(w), w.tvqRate ?? 0); }
  taxes(w: WeekState): number { return round2(this.tps(w) + this.tvq(w)); }
  /** Montant réel transféré = montant avant taxes + taxes. */
  transferTotal(w: WeekState): number { return round2(this.realAmount(w) + this.taxes(w)); }

  installmentTaxes(p: EmployeePaymentInstallment): number { return round2(p.tpsAmount + p.tvqAmount); }

  rateLabel(rate: number | undefined): string {
    return (rate ?? 0).toLocaleString('fr-CA', { maximumFractionDigits: 3 }) + ' %';
  }

  /** Taxes d'une ligne d'historique ; null = enregistrement antérieur à cette fonction. */
  historyTaxes(h: EmployeePaymentHistoryItem): number | null {
    return h.tpsAmount == null && h.tvqAmount == null ? null : round2((h.tpsAmount ?? 0) + (h.tvqAmount ?? 0));
  }

  // ── Date de paiement et confirmation du transfert ──────────────────────────
  setPayDate(w: WeekState, value: string): void { this._patch(w, { payDate: value ?? '', capped: w.capped }); }
  setTransferred(w: WeekState, value: boolean): void { this._patch(w, { transferred: value, capped: w.capped }); }

  canSave(w: WeekState): boolean {
    return !w.saving && !w.busyId && this.realAmount(w) > 0 && !this.reasonMissing(w) && !!w.payDate;
  }

  /** Enregistre un NOUVEAU versement pour la semaine (il s'ajoute aux précédents). */
  save(w: WeekState): void {
    const amount = this.realAmount(w);
    if (amount <= 0) { this._patch(w, { saveMsg: 'Le montant avant taxes doit être supérieur à 0.', saveError: true }); return; }
    if (!w.payDate) { this._patch(w, { saveMsg: 'Choisissez la date de paiement.', saveError: true }); return; }
    if (this.reasonMissing(w)) return;   // bouton grisé ; garde-fou
    const note = w.noteText.trim() || null;
    const paidDates = w.workDays.map(d => d.date).filter(d => w.selected.has(d));
    this._patch(w, { saving: true, saveError: false, confirmDeleteId: null });
    this.paymentsSvc.addInstallment({
      employeeId: w.employeeId, periodStart: w.weekStart, periodEnd: w.weekEnd, amount, note, paidDates,
      paymentDate: w.payDate, isTransferred: w.transferred,
    }).pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: saved => {
          const now = this._current(w);
          this._patch(w, {
            saving: false, payments: [...now.payments, saved], paidDates, paidAt: saved.savedAt,
            // Formulaire prêt pour le versement suivant
            realAmount: null, noteText: '', payDate: todayIso(), transferred: false, capped: false, history: null,
            saveMsg: `✓ Versement de ${this.fmt(saved.total)} enregistré` + (saved.isTransferred ? ' : transféré' : ' : reste à transférer'),
            saveError: false,
          });
          if (now.historyOpen) this._loadHistory(w);   // panneau ouvert : afficher la nouvelle ligne
        },
        error: err => this._patch(w, {
          saving: false, saveError: true, capped: w.capped,
          saveMsg: err?.error?.message ?? `Échec de l'enregistrement (HTTP ${err?.status ?? '?'}).`,
        }),
      });
  }

  // ── Actions sur un versement enregistré ────────────────────────────────────
  /** Coche / décoche « transféré » sur un versement déjà enregistré. */
  markTransferred(w: WeekState, p: EmployeePaymentInstallment, transferred: boolean): void {
    if (w.busyId) return;
    this._patch(w, { busyId: p.id, confirmDeleteId: null });
    this.paymentsSvc.setInstallmentTransferred(p.id, transferred)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: saved => {
          const now = this._current(w);
          this._patch(w, {
            busyId: null, payments: now.payments.map(x => x.id === saved.id ? saved : x), history: null,
            saveMsg: transferred ? `✓ Versement de ${this.fmt(saved.total)} marqué transféré` : 'Versement remis « à transférer »', saveError: false,
          });
          if (now.historyOpen) this._loadHistory(w);
        },
        error: err => this._patch(w, {
          busyId: null, saveError: true,
          saveMsg: err?.error?.message ?? `La modification a échoué (HTTP ${err?.status ?? '?'}).`,
        }),
      });
  }

  /** 1er clic : demande de confirmation ; 2e clic : annule ce versement. */
  deleteInstallment(w: WeekState, p: EmployeePaymentInstallment): void {
    if (w.busyId) return;
    if (w.confirmDeleteId !== p.id) { this._patch(w, { confirmDeleteId: p.id, saveMsg: w.saveMsg, capped: w.capped }); return; }
    this._patch(w, { confirmDeleteId: null, busyId: p.id });
    this.paymentsSvc.deleteInstallment(p.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const now = this._current(w);
          this._patch(w, {
            busyId: null, payments: now.payments.filter(x => x.id !== p.id), realAmount: null, capped: false, history: null,
            saveMsg: `Versement de ${this.fmt(p.total)} annulé`, saveError: false,
          });
          if (now.historyOpen) this._loadHistory(w);
        },
        error: err => this._patch(w, {
          busyId: null, saveError: true,
          saveMsg: err?.error?.message ?? `L'annulation a échoué (HTTP ${err?.status ?? '?'}).`,
        }),
      });
  }

  keepInstallment(w: WeekState): void { this._patch(w, { confirmDeleteId: null, saveMsg: w.saveMsg, capped: w.capped }); }

  // ── Historique des enregistrements ─────────────────────────────────────────
  toggleHistory(w: WeekState): void {
    const open = !w.historyOpen;
    this._patch(w, { historyOpen: open, saveMsg: w.saveMsg, capped: w.capped });
    if (open && !w.history) this._loadHistory(w);
  }

  private _loadHistory(w: WeekState): void {
    this._patch(w, { historyLoading: true, historyError: '', saveMsg: this._current(w).saveMsg });
    this.paymentsSvc.getHistory(w.employeeId, w.weekStart, w.weekEnd)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => this._patch(w, { historyLoading: false, history: list, saveMsg: this._current(w).saveMsg }),
        error: err => this._patch(w, {
          historyLoading: false, saveMsg: this._current(w).saveMsg,
          historyError: err?.error?.message ?? `Impossible de charger l'historique (HTTP ${err?.status ?? '?'}).`,
        }),
      });
  }

  /** « +20,00 $ » / « −10,00 $ » / « 0,00 $ » */
  deltaLabel(n: number): string {
    return (n > 0 ? '+' : n < 0 ? '−' : '') + this.fmt(Math.abs(n));
  }

  /** Journées cochées à cette date, en libellés courts (« lun. 21 sept., ven. 25 sept. »). */
  historyDays(h: EmployeePaymentHistoryItem): string {
    if (h.paidDates == null) return 'Non mémorisées';
    if (!h.paidDates.length) return 'Aucune journée';
    return h.paidDates.map(d => this.dayLabel(d)).join(', ');
  }

  historyTransferred(h: EmployeePaymentHistoryItem): string {
    return h.isTransferred == null ? '—' : h.isTransferred ? 'Oui' : 'Non';
  }

  // ── Affichage ──────────────────────────────────────────────────────────────
  weekLabel(w: WeekState): string {
    const f = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
    return `Semaine du ${f(w.weekStart)} au ${f(w.weekEnd)}`;
  }

  /** « 3 oct. 2026 à 12 h 40 » (heure locale) — moment d'un enregistrement. */
  paidAtLabel(iso: string): string {
    const d = new Date(iso);
    const date = d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' });
    return `${date} à ${time}`;
  }

  /** « 19 sept. 2026 » pour une date yyyy-MM-dd. */
  dateLabel(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  dayLabel(dateStr: string): string {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  dayTooltip(d: EmployeePaymentWorkDay): string {
    const lines = d.companies.map(c => `${c.name} — ${this.fmt(c.amount)}`);
    if (this.isOutOfPeriod(d)) lines.push('Hors de la période affichée');
    return lines.join('\n');
  }

  fmt(val: number | null | undefined): string {
    return (val ?? 0).toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  trackByGroup(_: number, g: EmployeeGroup): string { return g.employeeId; }
  trackByWeek(_: number, w: WeekState): string { return w.key; }
  trackByDate(_: number, d: EmployeePaymentWorkDay): string { return d.date; }
  trackByPayment(_: number, p: EmployeePaymentInstallment): string { return p.id; }

  private _currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
