import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { QueryLogItem, QueryLogPage, QueryLogService } from '../../../state/query-log/query-log.service';
import { TenantService } from '../../../state/tenant/tenant.service';
import { AuthService } from '../../../state/auth/auth.service';
import { locale } from '../../../state/i18n/i18n.service';
import { httpErrorMessage } from '../../shared/http-error';

type KindFilter = '' | 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Historique des requêtes : le contenu de chaque MODIFICATION envoyée à la base — ajout, mise à jour,
 * suppression — avec ses valeurs réelles, quand, et pour quel compte. Les lectures faites en naviguant ne sont
 * pas enregistrées. Lecture seule.
 * Un compte d'entreprise (droit « journal.view ») ne voit que le journal de SON entreprise — c'est l'API qui
 * l'impose ; le super-administrateur voit toutes les entreprises et peut filtrer par entreprise.
 */
@Component({
    selector: 'app-query-log',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './query-log.component.html',
    styleUrls: ['./query-log.component.scss']
})
export class QueryLogComponent implements OnInit {
  private svc        = inject(QueryLogService);
  private destroyRef = inject(DestroyRef);
  readonly tenants   = inject(TenantService);
  private auth       = inject(AuthService);

  /** Super-administrateur : toutes les entreprises (filtre et colonne « Entreprise » affichés). */
  readonly isSuper = this.auth.isSuperUser();

  readonly kinds: { id: KindFilter; label: string }[] = [
    { id: '', label: 'Toutes' }, { id: 'INSERT', label: 'Ajouts' }, { id: 'UPDATE', label: 'Mises à jour' }, { id: 'DELETE', label: 'Suppressions' },
  ];
  readonly pageSizes = [50, 100, 200];

  // ── Filtres (dates et heures locales de l'utilisateur) ────────────────────
  from       = this._localInput(new Date(Date.now() - 24 * 3600 * 1000));
  to         = '';
  account    = '';
  tenantId   = '';
  kind: KindFilter = '';
  failedOnly = false;
  search     = '';
  pageSize   = 50;

  // ── État ──────────────────────────────────────────────────────────────────
  loading  = signal(false);
  error    = signal('');
  data     = signal<QueryLogPage | null>(null);
  expanded = signal<ReadonlySet<number>>(new Set());
  private _request?: Subscription;

  pageCount = computed(() => { const d = this.data(); return d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1; });
  rangeLabel = computed(() => {
    const d = this.data();
    if (!d || d.total === 0) return '';
    const first = (d.page - 1) * d.pageSize + 1;
    return `${this.num(first)} à ${this.num(first + d.items.length - 1)} sur ${this.num(d.total)}`;
  });

  ngOnInit(): void {
    if (this.isSuper && !this.tenants.list().length) this.tenants.loadAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ error: () => { /* filtre sans la liste */ } });
    this.load(1);
  }

  /** Lance la recherche (page 1) ; une recherche plus récente remplace celle en cours. */
  apply(): void { this.load(1); }

  load(page: number): void {
    const fromIso = this._iso(this.from), toIso = this._iso(this.to);
    if (fromIso && toIso && fromIso > toIso) { this.error.set('La date de début doit être avant la date de fin.'); return; }
    this._request?.unsubscribe();
    this.loading.set(true); this.error.set(''); this.expanded.set(new Set());
    this._request = this.svc.search({
      from: fromIso, to: toIso, account: this.account, tenantId: this.isSuper ? this.tenantId : '', kind: this.kind,
      failedOnly: this.failedOnly, search: this.search.trim(), page, pageSize: this.pageSize,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: d => { this.data.set(d); this.loading.set(false); },
      error: err => { this.error.set(httpErrorMessage(err)); this.data.set(null); this.loading.set(false); },
    });
  }

  reset(): void {
    this.from = this._localInput(new Date(Date.now() - 24 * 3600 * 1000)); this.to = '';
    this.account = ''; this.tenantId = ''; this.kind = ''; this.failedOnly = false; this.search = '';
    this.load(1);
  }

  toggle(id: number): void {
    const next = new Set(this.expanded());
    next.has(id) ? next.delete(id) : next.add(id);
    this.expanded.set(next);
  }

  trackItem(_: number, i: QueryLogItem): number { return i.id; }

  /** Date et heure locales, à la seconde : « 11 oct. 2026, 13 h 22 min 41 s ». */
  when(iso: string): string {
    return new Date(iso).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  kindLabel(i: QueryLogItem): string {
    return { SELECT: 'Lecture', INSERT: 'Ajout', UPDATE: 'Mise à jour', DELETE: 'Suppression', MERGE: 'Fusion', EXEC: 'Procédure', AUTRE: 'Autre' }[i.kind] ?? i.kind;
  }

  isWrite(i: QueryLogItem): boolean { return i.kind === 'INSERT' || i.kind === 'UPDATE' || i.kind === 'MERGE'; }

  /** Valeurs des paramètres d'une ligne : nom → valeur (null, nombre, booléen ou texte ; « *** » = masquée). */
  values(i: QueryLogItem): [string, unknown][] {
    if (!i.parameters) return [];
    try { return Object.entries(JSON.parse(i.parameters) as Record<string, unknown>); } catch { return []; }
  }

  /** Valeur écrite comme dans une requête SQL : NULL, 1200.5, 1, N'Loyer d''octobre'. */
  literal(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `N'${String(v).replace(/'/g, "''")}'`;
  }

  /** La requête telle qu'elle a été exécutée : chaque paramètre (@p0, @__tid_0…) remplacé par sa valeur. */
  filled(i: QueryLogItem): string {
    let sql = i.sql;
    // Les noms les plus longs d'abord : @p1 ne doit pas entamer @p10
    for (const [name, value] of this.values(i).filter(([n]) => n.startsWith('@')).sort((a, b) => b[0].length - a[0].length)) {
      const rx = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_])', 'g');
      sql = sql.replace(rx, () => this.literal(value));
    }
    return sql;
  }

  /** Première ligne utile de la requête avec ses valeurs, pour la liste (le texte complet s'ouvre au clic). */
  preview(i: QueryLogItem): string {
    const line = this.filled(i).replace(/SET (IMPLICIT_TRANSACTIONS OFF|NOCOUNT ON);/gi, '').replace(/\s+/g, ' ').trim();
    return line.length > 220 ? line.slice(0, 220) + '…' : line;
  }

  num(n: number): string { return n.toLocaleString('fr-CA'); }

  /** Valeur d'un champ « datetime-local » (heure locale) → instant UTC en ISO 8601. */
  private _iso(local: string): string | undefined {
    if (!local) return undefined;
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  private _localInput(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
