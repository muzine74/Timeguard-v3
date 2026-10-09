import { Injectable, signal, computed, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Compagnie, WeekDay, TimeLogQueryResultDto, HourEntry } from '../../models';
import { WeekService } from './week.service';

/** État d'une semaine : ses lignes de compagnies (propres à la semaine — une semaine validée
 *  a ses compagnies figées) avec leurs coches et prix. */
interface WeekCache {
  rows: Compagnie[];
  /** Signature des coches telles qu'enregistrées en base (détection des modifications non sauvegardées). */
  savedSig: string;
}

@Injectable({ providedIn: 'root' })
export class PointageEmployeeService {
  private _compagnies  = signal<Compagnie[]>([]);
  private _loading     = signal(false);
  private _error       = signal<string | null>(null);
  private _cache       = new Map<string, WeekCache>();
  private _currentWeek = '';
  private _employeeId  = '';
  // true dès que load() a été invoqué — empêche initFromEmployee() d'écraser
  // le résultat (même vide) avec la liste brute non filtrée par statut actif
  private _loadRequested = false;
  // companyId → nom-jour-FR → prix effectif (customPrice ?? defaultPrice)
  private _pricingMap  = new Map<string, Record<string, number>>();
  // companyId → lundi de la Semaine 1 (compagnies bi-hebdo avec date de début)
  private _biWeeklyStart = new Map<string, string>();

  readonly compagnies = this._compagnies.asReadonly();

  /** Coches telles qu'enregistrées en base pour la semaine affichée. */
  private _savedSig = signal('');
  /** true si les coches affichées diffèrent de ce qui est enregistré (modifications non sauvegardées). */
  readonly isDirty  = computed(() => this._sig(this._compagnies()) !== this._savedSig());
  readonly isLoading  = this._loading.asReadonly();
  readonly error      = this._error.asReadonly();

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[PointageEmpSvc]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[PointageEmpSvc]', ...a); }

  /** Signal de premier niveau — réactif aux coches ET aux changements de semaine. */
  readonly weekTotal = computed(() => {
    const days = this._week.weekDays();
    return this._compagnies().reduce((s, c) =>
      s + days.reduce((ds, d) =>
        ds + (c.pointages?.[d.dateKey] ? (c.prices?.[d.dateKey] ?? 0) : 0), 0), 0);
  });

  constructor(private http: HttpClient, private _week: WeekService) {}

  load(weekKey: string, employeeId?: string, onLoaded?: () => void): void {
    this.log(`load(weekKey=${weekKey}, employeeId=${employeeId ?? 'undefined'})`);
    this._loadRequested = true;

    const employeeChanged = !!employeeId && employeeId !== this._employeeId;

    if (this._currentWeek && this._currentWeek !== weekKey && !employeeChanged) {
      this._cache.set(this._cacheKey(this._currentWeek), this._snapshotFull());
      this.log(`cache sauvegardé → ${this._cacheKey(this._currentWeek)}`);
    }
    this._currentWeek = weekKey;
    if (employeeId) this._employeeId = employeeId;

    const cacheKey = this._cacheKey(weekKey);
    const cached   = this._cache.get(cacheKey);
    if (cached && !employeeChanged) {
      this.log(`cache hit → ${cacheKey}`);
      // Restaure les lignes DE CETTE SEMAINE (et non celles de la semaine affichée juste avant)
      this._compagnies.set(this._cloneRows(cached.rows));
      this._savedSig.set(cached.savedSig);
      onLoaded?.();
      return;
    }

    if (!employeeId) {
      this.warn('employeeId manquant — aucun pointage chargé');
      this._compagnies.set([]);
      this._savedSig.set('');
      onLoaded?.();
      return;
    }

    this._loading.set(true);
    this._error.set(null);
    const url = `/api/Employee/${employeeId}/${weekKey}`;
    this.log(`GET ${url}`);

    this.http.get<TimeLogQueryResultDto[]>(url).subscribe({
      next: logs => {
        this.log(`✓ ${logs.length} timelog(s)`);
        if (!logs || logs.length === 0) {
          this._compagnies.set([]);
          this._savedSig.set('');
          this._cache.set(cacheKey, { rows: [], savedSig: '' });
          this._loading.set(false);
          onLoaded?.();
          return;
        }
        const compagnies = this._fromTimeLogs(logs);
        this._compagnies.set(compagnies);
        this._savedSig.set(this._sig(compagnies));
        this._cache.set(cacheKey, this._snapshotFull());
        this._loading.set(false);
        onLoaded?.();
      },
      error: err => {
        this.warn(`✕ GET ${url} échoué (${err.status})`);
        this._error.set(`Impossible de charger les pointages — HTTP ${err.status}`);
        this._compagnies.set([]);
        this._savedSig.set('');
        this._loading.set(false);
        onLoaded?.();
      }
    });
  }

  /** Clé de cache composite employé+semaine — évite qu'un changement d'employé réutilise le cache d'un autre. */
  private _cacheKey(weekKey: string): string {
    return `${this._employeeId}::${weekKey}`;
  }

  private _fromTimeLogs(logs: TimeLogQueryResultDto[]): Compagnie[] {
    const map = new Map<string, Compagnie & { pointages: Record<string, boolean>; prices: Record<string, number>; hours: Record<string, HourEntry[]> }>();
    let idCounter = 1;
    for (const log of logs) {
      if (!map.has(log.companyId)) {
        map.set(log.companyId, { id: idCounter++, companyId: log.companyId, nom: log.companyName, pointages: {}, prices: {}, hours: {} });
      }
      const comp = map.get(log.companyId)!;
      if (log.isHourly) {
        comp.hourly = true;
        if (log.hourlyRate != null) comp.hourlyRate = log.hourlyRate;
      }
      if (log.workDate && log.workDate !== '0001-01-01') {
        comp.pointages[log.workDate] = true;
        if (log.clientPrice > 0) comp.prices[log.workDate] = log.clientPrice;
        if (log.ranges?.length)
          comp.hours[log.workDate] = log.ranges.map(r => ({ begin: r.begin, end: r.end }));
        else if (log.beginWork && log.endWork)
          comp.hours[log.workDate] = [{ begin: log.beginWork.slice(11, 16), end: log.endWork.slice(11, 16) }];
      }
    }
    return Array.from(map.values()).map(c => ({ ...c, selected: false }));
  }

  // ── Pointage horaire : plusieurs plages (début / fin) par jour ──────────
  /** Plages du jour (au moins une ligne, vide, pour la saisie). */
  hoursOf(c: Compagnie, dk: string): HourEntry[] {
    const r = c.hours?.[dk];
    return r?.length ? r : [{ begin: '', end: '' }];
  }

  private static _min(t: string): number { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

  /** Durée d'une plage en heures (2 décimales) ; null si incomplète ou fin ≤ début. */
  static rangeDuration(e: HourEntry | undefined): number | null {
    if (!e?.begin || !e?.end) return null;
    const d = PointageEmployeeService._min(e.end) - PointageEmployeeService._min(e.begin);
    return d > 0 ? Math.round(d / 60 * 100) / 100 : null;
  }

  /** Total de la journée = somme des plages valides ; null si aucune. */
  static duration(ranges: HourEntry[] | undefined): number | null {
    const total = (ranges ?? []).reduce((s, r) => s + (PointageEmployeeService.rangeDuration(r) ?? 0), 0);
    return total > 0 ? Math.round(total * 100) / 100 : null;
  }

  /** Une plage incomplète (une seule heure), fin ≤ début, ou deux plages qui se chevauchent. */
  static isInvalid(ranges: HourEntry[] | undefined): boolean {
    const filled = (ranges ?? []).filter(r => r.begin || r.end);
    if (filled.some(r => PointageEmployeeService.rangeDuration(r) === null)) return true;
    const sorted = [...filled].sort((a, b) => a.begin.localeCompare(b.begin));
    return sorted.some((r, i) => i > 0 && PointageEmployeeService._min(r.begin) < PointageEmployeeService._min(sorted[i - 1].end));
  }

  setHours(compId: number, dk: string, index: number, field: 'begin' | 'end', value: string): void {
    this._updateRanges(compId, dk, (c, ranges) => ranges.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }

  /** Ajoute une plage vide à la journée. */
  addRange(compId: number, dk: string): void {
    this._updateRanges(compId, dk, (c, ranges) => [...ranges, { begin: '', end: '' }]);
  }

  /** Retire une plage (la dernière restante est vidée plutôt que supprimée). */
  removeRange(compId: number, dk: string, index: number): void {
    this._updateRanges(compId, dk, (c, ranges) => {
      const next = ranges.filter((_, i) => i !== index);
      return next.length ? next : [{ begin: '', end: '' }];
    });
  }

  private _updateRanges(compId: number, dk: string, fn: (c: Compagnie, ranges: HourEntry[]) => HourEntry[]): void {
    this._compagnies.update(l => l.map(c => {
      if (c.id !== compId) return c;
      const ranges = fn(c, this.hoursOf(c, dk).map(r => ({ ...r })));
      const hours  = { ...c.hours, [dk]: ranges };
      const dur    = PointageEmployeeService.duration(ranges);
      const prices = { ...c.prices };
      // Aperçu de la paie (le serveur recalcule et fige le montant à l'enregistrement) :
      // payé à l'heure → heures × taux ; payé à la visite → prix du planning pour ce jour
      const visitPrice = this._planPrice(c.companyId, dk);
      if (dur !== null && c.hourlyRate != null) prices[dk] = Math.round(dur * c.hourlyRate * 100) / 100;
      else if (dur !== null && c.hourlyRate == null && visitPrice !== undefined) prices[dk] = visitPrice;
      else delete prices[dk];
      return { ...c, hours, prices, pointages: { ...c.pointages, [dk]: dur !== null } };
    }));
    if (this._currentWeek) this._cache.set(this._cacheKey(this._currentWeek), this._snapshotFull());
  }


  totalHours(c: Compagnie, days: WeekDay[]): number {
    return Math.round(days.reduce((s, d) => s + (PointageEmployeeService.duration(c.hours?.[d.dateKey]) ?? 0), 0) * 100) / 100;
  }

  /** Premier problème de saisie horaire, ou null. */
  readonly hoursError = computed(() => {
    const days = this._week.weekDays();
    for (const c of this._compagnies()) {
      if (!c.hourly) continue;
      const bad = days.find(d => PointageEmployeeService.isInvalid(c.hours?.[d.dateKey]));
      if (bad) return `${c.nom} — ${bad.labelFull} : chaque plage doit avoir un début et une fin (fin après le début), sans chevauchement.`;
    }
    return null;
  });

  /** Payload des pointages horaires : chaque ligne horaire est envoyée (même vide → suppression des heures retirées). */
  hoursSnapshot(): Record<string, Record<string, HourEntry[]>> {
    return Object.fromEntries(this._compagnies()
      .filter(c => c.hourly)
      .map(c => [c.companyId, Object.fromEntries(
        Object.entries(c.hours ?? {})
          .map(([k, rs]) => [k, rs.filter(r => r.begin || r.end).map(r => ({ ...r }))] as [string, HourEntry[]])
          .filter(([, rs]) => rs.length))]));
  }

  toggle(compId: number, dateKey: string): void {
    this._compagnies.update(l => l.map(c => {
      if (c.id !== compId) return c;
      const isNowChecked = !c.pointages?.[dateKey];
      const newPrices = { ...c.prices };
      // Injecter le prix du calendrier si la case est cochée pour la première fois
      if (isNowChecked && this._biWeeklyStart.has(c.companyId)) {
        // Bi-hebdo : le prix suit toujours le planning de la semaine (1 ou 2) ; jour non prévu cette semaine → pas de prix
        const price = this._planPrice(c.companyId, dateKey);
        if (price !== undefined) newPrices[dateKey] = price; else delete newPrices[dateKey];
      } else if (isNowChecked && !(dateKey in newPrices)) {
        const price = this._planPrice(c.companyId, dateKey);
        if (price !== undefined) newPrices[dateKey] = price;
      }
      return { ...c, pointages: { ...c.pointages, [dateKey]: isNowChecked }, prices: newPrices };
    }));
    if (this._currentWeek) this._cache.set(this._cacheKey(this._currentWeek), this._snapshotFull());
  }

  private _toDayName(dateKey: string): string {
    const [y, m, d] = dateKey.split('-').map(Number);
    return ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][
      new Date(y, m - 1, d).getDay()
    ];
  }

  /**
   * Prix du planning pour une journée (aperçu avant enregistrement ; le serveur fige le vrai montant).
   * Clés du planning : « Lundi » (hebdo), « S1-Lundi » / « S2-Lundi » (bi-hebdo), « Bi-16 » (bi-mensuel), « 16 » (mensuel).
   * Bi-hebdo : la semaine 1 ou 2 n'est pas connue ici → aperçu seulement si les deux semaines ont le même prix.
   */
  private _planPrice(companyId: string, dateKey: string): number | undefined {
    const map = this._pricingMap.get(companyId);
    if (!map) return undefined;
    const name = this._toDayName(dateKey);
    const day  = String(Number(dateKey.split('-')[2]));
    if (map[name] !== undefined) return map[name];
    // Bi-hebdo avec date de début connue : seul le planning de LA semaine (1 ou 2) compte —
    // un jour coché uniquement dans l'autre semaine du planning n'affiche pas de prix (comme le serveur).
    const start = this._biWeeklyStart.get(companyId);
    if (start) return map[(this._weeksBetween(start, dateKey) % 2 === 0 ? 'S1-' : 'S2-') + name];
    const s1 = map['S1-' + name], s2 = map['S2-' + name];
    if (s1 !== undefined && (s2 === undefined || s2 === s1)) return s1;
    if (s1 === undefined && s2 !== undefined) return s2;
    return map['Bi-' + day] ?? map[day];
  }

  /** Semaines entières (en valeur absolue) entre le lundi de deux dates yyyy-MM-dd. */
  private _weeksBetween(a: string, b: string): number {
    const monday = (s: string) => {
      const [y, m, d] = s.split('-').map(Number);
      const t = Date.UTC(y, m - 1, d);
      return t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000;
    };
    return Math.abs(Math.round((monday(b) - monday(a)) / (7 * 86_400_000)));
  }

  /** Employé dont le planning tarifaire est chargé (les prix personnalisés dépendent de l'employé). */
  private _pricingEmployeeId: string | null = null;

  /** Charge le calendrier tarifaire de chaque compagnie pour enrichir les prix lors du cochage. */
  loadPricing(employeeId: string, companyIds: string[]): void {
    this._pricingMap.clear();              // ne pas garder les prix d'un autre employé
    this._biWeeklyStart.clear();
    this._pricingEmployeeId = employeeId;
    for (const companyId of companyIds) {
      this.http.get<{ day: string; defaultPrice: number; customPrice?: number; biWeeklyStart?: string | null }[]>(
        `/api/employee/${employeeId}/pricing/${companyId}`
      ).subscribe({
        next: entries => {
          if (this._pricingEmployeeId !== employeeId) return;   // réponse arrivée après un changement d'employé
          const map: Record<string, number> = {};
          for (const e of entries) map[(e.day ?? '').trim()] = e.customPrice ?? e.defaultPrice;
          this._pricingMap.set(companyId, map);
          const start = entries.find(e => e.biWeeklyStart)?.biWeeklyStart;
          if (start) this._biWeeklyStart.set(companyId, start);
          this.log(`✓ pricing ${companyId} (${entries.length} jours)`);
        },
        error: err => this.warn(`✕ pricing ${companyId} — HTTP ${err.status}`),
      });
    }
  }

  selectAll(days: WeekDay[]): void {
    // Les lignes horaires se saisissent heure par heure : « tout cocher » ne les touche pas
    this._compagnies.update(l => l.map(c => c.hourly ? c : ({
      ...c, pointages: Object.fromEntries(days.map(d => [d.dateKey, true]))
    })));
    if (this._currentWeek) this._cache.set(this._cacheKey(this._currentWeek), this._snapshotFull());
  }

  clearAll(): void {
    this._compagnies.update(l => l.map(c => c.hourly ? { ...c, pointages: {}, hours: {}, prices: {} } : { ...c, pointages: {} }));
    if (this._currentWeek) this._cache.set(this._cacheKey(this._currentWeek), this._snapshotFull());
  }

  /** Initialise la liste des compagnies depuis l'employé (fallback si timelogs vides). */
  initFromEmployee(empCompanies: { compagnieId: string; compagnieName: string }[]): void {
    // déjà peuplé par les timelogs, ou load() déjà invoqué (source non filtrée par statut actif)
    if (this._compagnies().length > 0 || this._loadRequested) return;
    let id = 1;
    this._compagnies.set(empCompanies.map(c => ({
      id:        id++,
      companyId: c.compagnieId,
      nom:       c.compagnieName,
      pointages: {},
      prices:    {},
      selected:  false,
    })));
    this._savedSig.set(this._sig(this._compagnies()));
    this.log(`initFromEmployee() → ${empCompanies.length} compagnie(s)`);
  }

  clearCache(): void { this.log('clearCache()'); this._cache.clear(); }

  /** Supprime uniquement la semaine validée du cache (les autres semaines sont conservées). */
  removeFromCache(weekKey: string): void {
    const key = this._cacheKey(weekKey);
    this._cache.delete(key);
    this.log(`cache retiré → ${key}`);
  }

  isChecked(c: Compagnie, dk: string): boolean { return !!c.pointages?.[dk]; }
  count(c: Compagnie, days: WeekDay[]): number  { return days.filter(d => !!c.pointages?.[d.dateKey]).length; }
  total(days: WeekDay[]): number { return this._compagnies().reduce((s, c) => s + this.count(c, days), 0); }

  /** Payload pour l'API (visites ; les lignes horaires passent par hoursSnapshot()). */
  snapshot(): Record<string, Record<string, boolean>> {
    return Object.fromEntries(this._compagnies().map(c => [c.companyId, { ...c.pointages }]));
  }

  /** Snapshot complet pour le cache interne (pointages + prix). */
  private _snapshotFull(): WeekCache {
    return { rows: this._cloneRows(this._compagnies()), savedSig: this._savedSig() };
  }

  /** À appeler après une sauvegarde réussie : l'état affiché devient l'état enregistré. */
  markSaved(): void {
    this._savedSig.set(this._sig(this._compagnies()));
    if (this._currentWeek) this._cache.set(this._cacheKey(this._currentWeek), this._snapshotFull());
  }

  /** Signature stable des jours cochés par compagnie (l'ordre des lignes est ignoré). */
  private _sig(rows: Compagnie[]): string {
    return rows
      .map(c => c.hourly
        ? `${c.companyId}:h:${Object.keys(c.hours ?? {}).sort()
            .map(k => [k, c.hours![k].filter(r => r.begin || r.end).map(r => `${r.begin}-${r.end}`).join('+')])
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}=${v}`).join(',')}`
        : `${c.companyId}:${Object.keys(c.pointages ?? {}).filter(k => c.pointages![k]).sort().join(',')}`)
      .sort()
      .join('|');
  }

  private _cloneRows(rows: Compagnie[]): Compagnie[] {
    return rows.map(c => ({
      ...c, pointages: { ...c.pointages }, prices: { ...c.prices },
      hours: Object.fromEntries(Object.entries(c.hours ?? {}).map(([k, rs]) => [k, rs.map(r => ({ ...r }))])),
    }));
  }

  getEmployeeId(): string { return this._employeeId; }
  setEmployeeId(id: string): void { this._employeeId = id; }
}
