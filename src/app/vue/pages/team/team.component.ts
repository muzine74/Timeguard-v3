import { Component, ChangeDetectionStrategy, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TeamService, TeamMember, TeamNote } from '../../../state/team/team.service';
import { AuthService } from '../../../state/auth/auth.service';
import { WeekService } from '../../../state/pointage/week.service';
import { PointageEmployeeService } from '../../../state/pointage/pointage-employee.service';
import { PointageTableComponent } from '../../components/pointage-table/pointage-table.component';

interface TreeNode { m: TeamMember; children: TreeNode[]; }
type Scope = 'all' | 'mine';

/**
 * « Équipe » — fusion de « Hiérarchie » et « Mon équipe » :
 *   • gestion des employés (employees.view) : organigramme complet + employés « sans chef » ;
 *   • chef d'équipe : son équipe (directe + indirecte) ;
 *   • les deux : sélecteur « Toute l'entreprise / Mon équipe ».
 * Clic sur une personne → son pointage (lecture seule) et ses notes. Droits vérifiés par l'API.
 */
@Component({
    selector: 'app-team',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, RouterLink, PointageTableComponent],
    template: `
    <div class="page">
      <header class="page-head">
        <div>
          <h1 class="page-title">Équipe</h1>
          <p class="page-sub">
            <ng-container *ngIf="scope() === 'all'">Organigramme de l'entreprise : responsables, chefs d'équipe et employés.</ng-container>
            <ng-container *ngIf="scope() === 'mine'">Votre équipe, directe et indirecte.</ng-container>
            Cliquez sur une personne pour voir son pointage (lecture seule) et ses notes.
          </p>
        </div>
        <div class="scope" role="group" aria-label="Périmètre affiché" *ngIf="canSeeAll && team.hasTeam()">
          <button type="button" class="btn btn-sm" [class.btn-primary]="scope() === 'all'" [class.btn-outline]="scope() !== 'all'"
                  [attr.aria-pressed]="scope() === 'all'" (click)="setScope('all')">Toute l'entreprise</button>
          <button type="button" class="btn btn-sm" [class.btn-primary]="scope() === 'mine'" [class.btn-outline]="scope() !== 'mine'"
                  [attr.aria-pressed]="scope() === 'mine'" (click)="setScope('mine')">Mon équipe</button>
        </div>
      </header>

      <div class="stats" *ngIf="loaded() && members().length">
        <span class="stat" *ngIf="scope() === 'all'"><b>{{ stats().tops }}</b> responsable{{ stats().tops > 1 ? 's' : '' }}</span>
        <span class="stat"><b>{{ stats().leads }}</b> chef{{ stats().leads > 1 ? 's' : '' }} d'équipe</span>
        <span class="stat"><b>{{ stats().members }}</b> employé{{ stats().members > 1 ? 's' : '' }}</span>
        <span class="stat stat-warn" *ngIf="orphans().length"><b>{{ orphans().length }}</b> sans chef</span>
      </div>

      <p class="muted" *ngIf="!loaded()">Chargement…</p>
      <p class="muted" *ngIf="loaded() && !members().length">
        <ng-container *ngIf="scope() === 'mine'">Vous ne supervisez personne pour l'instant. Un administrateur vous rattache des membres depuis leur fiche employé (champ « Chef d'équipe »).</ng-container>
        <ng-container *ngIf="scope() === 'all'">Aucun employé.</ng-container>
      </p>

      <div class="layout" *ngIf="members().length">
        <!-- ── Arbre ── -->
        <div class="tree-col">
          <div class="toolbar">
            <label class="search">
              <span class="sr-only">Rechercher une personne</span>
              <input class="inp" type="search" placeholder="Rechercher une personne…" [ngModel]="query()" (ngModelChange)="query.set($event)" />
            </label>
            <label class="chk"><input type="checkbox" [ngModel]="showInactive()" (ngModelChange)="showInactive.set($event)" /> Inactifs</label>
            <button type="button" class="btn btn-outline btn-sm" (click)="expandAll()">Tout déplier</button>
            <button type="button" class="btn btn-outline btn-sm" (click)="collapseAll()">Tout replier</button>
          </div>

          <ul class="legend" *ngIf="roots().length" aria-label="Couleurs des niveaux">
            <li *ngFor="let l of levels(); let i = index" [class]="'lvl-' + (i % 5)">
              <span class="swatch" aria-hidden="true"></span> Niveau {{ i + 1 }}<ng-container *ngIf="i === 0 && scope() === 'all'"> — responsables</ng-container>
            </li>
          </ul>

          <p class="muted" *ngIf="loaded() && !roots().length && orphans().length">
            Aucun responsable défini : cochez « Chef d'équipe » sur la fiche d'un responsable, puis rattachez-lui ses équipes.
          </p>
          <p class="muted" *ngIf="query() && !visibleCount()">Aucune personne ne correspond à « {{ query() }} ».</p>

          <ul class="tree" *ngIf="roots().length" aria-label="Organigramme">
            <ng-container *ngFor="let n of roots(); trackBy: trackNode">
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: n }"></ng-container>
            </ng-container>
          </ul>

          <section class="orphans" *ngIf="visibleOrphans().length" aria-labelledby="orphans-title">
            <h2 class="block-title" id="orphans-title">Sans chef d'équipe <span class="count">{{ visibleOrphans().length }}</span></h2>
            <p class="muted">À rattacher à un chef d'équipe (obligatoire au prochain enregistrement de la fiche).</p>
            <ul class="orphan-list">
              <li *ngFor="let m of visibleOrphans(); trackBy: trackMember">
                <div class="card orphan" [class.off]="!m.isActive" [class.selected]="m.employeeId === selectedId()">
                  <button type="button" class="name-btn" (click)="select(m)" [attr.aria-pressed]="m.employeeId === selectedId()">{{ m.name }}</button>
                  <span class="pill pill-off" *ngIf="!m.isActive">Inactif</span>
                  <a class="link" *ngIf="canEdit" [routerLink]="['/employees', m.employeeId, 'edit']" [attr.aria-label]="'Rattacher ' + m.name + ' à un chef (fiche)'">Rattacher →</a>
                </div>
              </li>
            </ul>
          </section>
        </div>

        <!-- ── Détail de la personne sélectionnée ── -->
        <section class="detail" *ngIf="selected() as m" [attr.aria-label]="'Détail — ' + m.name">
          <div class="detail-head">
            <div>
              <h2 class="d-name">{{ m.name }}</h2>
              <p class="d-sub">
                {{ m.isTeamLead ? (m.managerId ? 'Chef d’équipe' : 'Responsable') : m.employeeType }}
                <ng-container *ngIf="m.managerName"> · chef : {{ m.managerName }}</ng-container>
                <ng-container *ngIf="m.isTeamLead"> · équipe : {{ m.totalReports }}</ng-container>
                <ng-container *ngIf="!m.isActive"> · inactif</ng-container>
              </p>
            </div>
            <div class="week-nav" role="group" aria-label="Semaine affichée">
              <button type="button" class="btn btn-outline btn-sm" (click)="shiftWeek(-7)" aria-label="Semaine précédente">◀</button>
              <span class="week-label">{{ week.weekLabel() }}</span>
              <button type="button" class="btn btn-outline btn-sm" (click)="shiftWeek(7)" aria-label="Semaine suivante">▶</button>
              <button type="button" class="btn btn-outline btn-sm" (click)="today()">Aujourd'hui</button>
            </div>
          </div>

          <h3 class="block-title">Pointage <span class="count">lecture seule</span></h3>
          <p class="muted" *ngIf="ptEmp.isLoading()">Chargement…</p>
          <p class="muted" *ngIf="!ptEmp.isLoading() && !ptEmp.compagnies().length">Aucune compagnie ni pointage cette semaine.</p>
          <app-pointage-table *ngIf="ptEmp.compagnies().length" mode="employee" [locked]="true"></app-pointage-table>

          <h3 class="block-title">Notes <span class="count">{{ notes().length }}</span></h3>
          <p class="muted" *ngIf="notesLoading()">Chargement…</p>
          <p class="muted" *ngIf="!notesLoading() && notesError()">{{ notesError() }}</p>
          <p class="muted" *ngIf="!notesLoading() && !notesError() && !notes().length">Aucune note liée à {{ m.name }}.</p>
          <ul class="notes" *ngIf="notes().length">
            <li *ngFor="let n of notes()" class="note">
              <div class="note-head">
                <span class="note-title">{{ n.title }}</span>
                <span class="pill" [class.pill-lead]="n.isActive" [class.pill-off]="!n.isActive">{{ n.isActive ? 'Active' : 'Inactive' }}</span>
              </div>
              <p class="note-desc" *ngIf="n.description">{{ n.description }}</p>
              <p class="note-meta">{{ n.createdByEmployeeName }} · {{ n.createdAt | date:'d MMM y' }}</p>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <ng-template #nodeTpl let-n>
      <li *ngIf="isVisible(n)" [class]="'node lvl-' + (n.m.depth % 5)">
        <div class="card" [class.lead]="n.m.isTeamLead" [class.off]="!n.m.isActive" [class.hit]="isHit(n)" [class.selected]="n.m.employeeId === selectedId()">
          <button type="button" class="toggle" *ngIf="visibleChildren(n).length"
                  [attr.aria-expanded]="isOpen(n)"
                  [attr.aria-label]="(isOpen(n) ? 'Replier' : 'Déplier') + ' l’équipe de ' + n.m.name"
                  (click)="toggle(n)">{{ isOpen(n) ? '▾' : '▸' }}</button>
          <span class="toggle-spacer" *ngIf="!visibleChildren(n).length" aria-hidden="true"></span>
          <button type="button" class="name-btn" (click)="select(n.m)" [attr.aria-pressed]="n.m.employeeId === selectedId()"
                  [attr.aria-label]="'Voir le pointage et les notes de ' + n.m.name">{{ n.m.name }}</button>
          <span class="pill pill-top"  *ngIf="n.m.isTeamLead && !n.m.managerId">Responsable</span>
          <span class="pill pill-lead" *ngIf="n.m.isTeamLead && n.m.managerId">Chef</span>
          <span class="pill pill-off"  *ngIf="!n.m.isActive">Inactif</span>
          <span class="size" *ngIf="n.m.isTeamLead">équipe : {{ n.m.totalReports }}</span>
          <a class="link" *ngIf="canEdit" [routerLink]="['/employees', n.m.employeeId, 'edit']" [attr.aria-label]="'Fiche de ' + n.m.name">Fiche</a>
        </div>
        <ul class="children" *ngIf="visibleChildren(n).length && isOpen(n)">
          <ng-container *ngFor="let c of visibleChildren(n); trackBy: trackNode">
            <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: c }"></ng-container>
          </ng-container>
        </ul>
      </li>
    </ng-template>
  `,
    styles: [`
    .page { padding: 24px 20px; max-width: 1500px; margin: 0 auto; }
    .page-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-end; }
    .page-title { font-size: 22px; margin: 0; }
    .page-sub, .muted { color: var(--muted); font-size: 13px; }
    .scope { display: flex; gap: 6px; }
    .stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0 0; }
    .stat { font-size: 12.5px; padding: 4px 10px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); }
    .stat b { color: var(--text); }
    .stat-warn { border-color: rgba(var(--accent-rgb), .4); color: var(--accent); }

    .layout { display: grid; grid-template-columns: minmax(320px, 440px) minmax(0, 1fr); gap: 20px; margin-top: 16px; align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .tree-col { min-width: 0; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
    .search { flex: 1 1 180px; }
    .search .inp { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 8px; font-size: 13px;
                   background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    .search .inp:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; border-color: var(--accent); }
    .search .inp::placeholder { color: var(--muted); }
    .chk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text); cursor: pointer; }

    /* Couleur par niveau (cycle de 5) */
    .lvl-0 { --lvl: var(--accent); } .lvl-1 { --lvl: #4c8dff; } .lvl-2 { --lvl: #34c38f; } .lvl-3 { --lvl: #b07cff; } .lvl-4 { --lvl: #ff8a4c; }
    .legend { list-style: none; display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 10px; padding: 0; font-size: 12px; color: var(--muted); }
    .legend li { display: flex; align-items: center; gap: 6px; }
    .swatch { width: 18px; height: 0; border-top: 3px dotted var(--lvl); }

    /* Arbre : trait vertical pointillé le long de l'équipe + trait horizontal vers chaque membre */
    .tree, .children, .orphan-list, .notes { list-style: none; margin: 0; padding: 0; }
    .children { margin-left: 20px; }
    .children > .node { position: relative; padding-left: 22px; }
    .children > .node::before { content: ''; position: absolute; left: 0; top: -6px; bottom: 0; border-left: 2px dotted var(--lvl); }
    .children > .node:last-child::before { bottom: auto; height: 27px; }
    .children > .node::after { content: ''; position: absolute; left: 0; top: 21px; width: 20px; border-top: 2px dotted var(--lvl); }
    .node { margin: 6px 0; }
    .card { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 6px 10px; border-radius: 10px;
            background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--lvl, var(--border)); }
    .card.off { border-top-style: dashed; border-right-style: dashed; border-bottom-style: dashed; }
    .card.off .name-btn { color: var(--muted); }
    .card.hit { outline: 2px solid var(--accent); }
    .card.selected { background: rgba(var(--accent-rgb), .10); box-shadow: inset 0 0 0 1px rgba(var(--accent-rgb), .45); }
    .toggle { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2);
              color: var(--text); cursor: pointer; line-height: 1; }
    .toggle-spacer { width: 26px; }
    .name-btn { background: none; border: none; padding: 4px 2px; min-height: 26px; color: var(--text); font-weight: 600;
                font-size: 13px; cursor: pointer; text-align: left; }
    .name-btn:hover { text-decoration: underline; }
    .toggle:focus-visible, .link:focus-visible, .name-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .pill { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--border); white-space: nowrap; }
    .pill-top  { color: var(--on-accent); background: var(--accent); border-color: var(--accent); }
    .pill-lead { color: var(--accent); border-color: rgba(var(--accent-rgb), .4); }
    .pill-off  { color: var(--danger-text); border-color: rgba(224,82,82,.3); }
    .size { font-size: 12px; color: var(--muted); }
    .link { margin-left: auto; font-size: 12.5px; color: var(--accent); text-decoration: none; padding: 4px 6px; min-height: 24px; display: inline-flex; align-items: center; }
    .link:hover { text-decoration: underline; }
    .block-title { display: flex; align-items: center; gap: 8px; font-size: 14px; margin: 20px 0 8px; }
    .count { font-size: 10.5px; font-weight: 600; color: var(--muted); border: 1px solid var(--border); border-radius: 10px; padding: 1px 7px; }
    .orphan-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }

    .detail { min-width: 0; position: sticky; top: 72px; }
    .detail-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; align-items: flex-end; }
    .d-name { margin: 0; font-size: 18px; }
    .d-sub { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
    .week-nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .week-label { font-weight: 600; font-size: 13px; }
    .notes { display: flex; flex-direction: column; gap: 8px; }
    .note { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; }
    .note-head { display: flex; justify-content: space-between; gap: 8px; }
    .note-title { font-weight: 600; }
    .note-desc { margin: 6px 0 0; font-size: 13px; white-space: pre-wrap; }
    .note-meta { margin: 6px 0 0; font-size: 11.5px; color: var(--muted); }
    @media (max-width: 1000px) { .detail { position: static; } }
  `]
})
export class TeamComponent implements OnInit {
  readonly team  = inject(TeamService);
  readonly auth  = inject(AuthService);
  readonly week  = inject(WeekService);
  readonly ptEmp = inject(PointageEmployeeService);
  private destroyRef = inject(DestroyRef);

  /** Organigramme complet (gestion des employés). */
  readonly canSeeAll = this.auth.hasPerm('employees.view');
  /** Lien vers la fiche (modification du rattachement). */
  readonly canEdit   = this.auth.hasPerm('employees.edit');

  readonly scope        = signal<Scope>(this.canSeeAll ? 'all' : 'mine');
  private  allMembers   = signal<TeamMember[]>([]);
  readonly loadedAll    = signal(false);
  readonly members      = computed(() => this.scope() === 'all' ? this.allMembers() : this.team.members());
  readonly loaded       = computed(() => this.scope() === 'all' ? this.loadedAll() : this.team.loaded());

  readonly query        = signal('');
  readonly showInactive = signal(true);
  private  collapsed    = signal<Set<string>>(new Set());

  readonly selectedId   = signal<string | null>(null);
  readonly selected     = computed(() => this.members().find(m => m.employeeId === this.selectedId()) ?? null);
  readonly notes        = signal<TeamNote[]>([]);
  readonly notesLoading = signal(false);
  readonly notesError   = signal('');

  /** Arbre reconstruit depuis la liste aplatie (ordre en profondeur + profondeur). */
  readonly roots = computed<TreeNode[]>(() => {
    const roots: TreeNode[] = [];
    const stack: TreeNode[] = [];
    for (const m of this.members()) {
      if (m.missingManager) continue;
      const node: TreeNode = { m, children: [] };
      stack.length = m.depth;
      if (m.depth === 0) roots.push(node); else stack[m.depth - 1]?.children.push(node);
      stack[m.depth] = node;
    }
    return roots;
  });

  readonly orphans = computed(() => this.members().filter(m => m.missingManager));

  readonly levels = computed(() => {
    const max = Math.max(-1, ...this.members().filter(m => !m.missingManager).map(m => m.depth));
    return Array.from({ length: max + 1 }, (_, i) => i);
  });

  readonly stats = computed(() => {
    const placed = this.members().filter(m => !m.missingManager);
    return {
      tops:    placed.filter(m => m.isTeamLead && !m.managerId).length,
      leads:   placed.filter(m => m.isTeamLead && (!!m.managerId || this.scope() === 'mine')).length,
      members: placed.filter(m => !m.isTeamLead).length,
    };
  });

  /** Ids visibles : correspondances de la recherche + leurs responsables (chaîne complète). */
  private readonly visibleIds = computed<Set<string> | null>(() => {
    const q = this.query().trim().toLowerCase();
    const inactiveOk = this.showInactive();
    if (!q && inactiveOk) return null;
    const byId = new Map(this.members().map(m => [m.employeeId, m]));
    const ids = new Set<string>();
    for (const m of this.members()) {
      if (!inactiveOk && !m.isActive) continue;
      if (q && !m.name.toLowerCase().includes(q)) continue;
      let cur: TeamMember | undefined = m;
      while (cur && !ids.has(cur.employeeId)) {
        ids.add(cur.employeeId);
        cur = cur.managerId ? byId.get(cur.managerId) : undefined;
      }
    }
    return ids;
  });

  readonly visibleCount   = computed(() => this.visibleIds()?.size ?? this.members().length);
  readonly visibleOrphans = computed(() => { const ids = this.visibleIds(); return this.orphans().filter(m => !ids || ids.has(m.employeeId)); });

  ngOnInit(): void {
    this.team.load();
    if (this.canSeeAll) this._loadAll();
    else this._selectFirstWhenLoaded();
  }

  setScope(s: Scope): void {
    this.scope.set(s);
    this.selectedId.set(null);
    this.query.set('');
    this._selectFirstWhenLoaded();
  }

  private _loadAll(): void {
    this.team.hierarchy().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:  list => { this.allMembers.set(list ?? []); this.loadedAll.set(true); this._selectFirstWhenLoaded(); },
      error: () => { this.allMembers.set([]); this.loadedAll.set(true); },
    });
  }

  /** Sélectionne la première personne de l'arbre dès que les données du périmètre sont là. */
  private _selectFirstWhenLoaded(): void {
    if (this.selectedId()) return;
    const first = this.members()[0];
    if (first) { this.select(first); return; }
    if (!this.loaded()) setTimeout(() => this._selectFirstWhenLoaded(), 150);
  }

  isVisible(n: TreeNode): boolean { const ids = this.visibleIds(); return !ids || ids.has(n.m.employeeId); }
  visibleChildren(n: TreeNode): TreeNode[] { return n.children.filter(c => this.isVisible(c)); }
  isHit(n: TreeNode): boolean { const q = this.query().trim().toLowerCase(); return !!q && n.m.name.toLowerCase().includes(q); }
  isOpen(n: TreeNode): boolean { return !!this.query().trim() || !this.collapsed().has(n.m.employeeId); }

  toggle(n: TreeNode): void {
    this.collapsed.update(s => { const next = new Set(s); next.has(n.m.employeeId) ? next.delete(n.m.employeeId) : next.add(n.m.employeeId); return next; });
  }
  expandAll(): void   { this.collapsed.set(new Set()); }
  collapseAll(): void { this.collapsed.set(new Set(this.members().filter(m => m.directReports > 0).map(m => m.employeeId))); }

  select(m: TeamMember): void {
    this.selectedId.set(m.employeeId);
    this._loadPointage();
    this.notesLoading.set(true);
    this.notesError.set('');
    this.team.notes(m.employeeId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:  n => { this.notes.set(n ?? []); this.notesLoading.set(false); },
      error: err => {
        this.notes.set([]); this.notesLoading.set(false);
        this.notesError.set(err?.status === 403 ? 'Notes non accessibles pour cette personne.' : 'Impossible de charger les notes.');
      },
    });
  }

  shiftWeek(days: number): void { this.week.shift(days); this._loadPointage(); }
  today(): void { this.week.goToday(); this._loadPointage(); }

  private _loadPointage(): void {
    const id = this.selectedId();
    if (id) this.ptEmp.load(this.week.weekKey(), id);
  }

  trackNode(_: number, n: TreeNode): string { return n.m.employeeId; }
  trackMember(_: number, m: TeamMember): string { return m.employeeId; }
}
