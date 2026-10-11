import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnChanges, SimpleChanges, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PermissionItem, TenantService } from '../../../../state/tenant/tenant.service';
import { httpErrorMessage } from '../../../shared/http-error';

interface PermModule { label: string; perms: PermissionItem[]; }

/**
 * Super-administrateur : pages et droits associés à une entreprise. Les administrateurs de l'entreprise ne
 * voient et n'attribuent à leurs groupes que les droits cochés ici ; un droit décoché ne compte plus à la
 * connexion, même s'il est encore dans un groupe. Tout coché = entreprise non restreinte.
 */
@Component({
    selector: 'app-tenant-permissions',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
    <div class="section-card">
      <div class="section-card-hdr">
        <span class="section-card-title">🔐 Pages et droits de l'entreprise</span>
        <span class="state" [class.state-open]="!restricted()" *ngIf="!loading() && !loadError()">
          {{ restricted() ? selectedCount() + ' droits sur ' + catalog().length : 'Tous les droits' }}
        </span>
      </div>

      <div class="body">
        <p class="hint">
          Les administrateurs de cette entreprise ne voient et n'attribuent à leurs groupes que les pages et les droits cochés.
          Une page s'ouvre avec son droit de page et le droit d'action correspondant.
        </p>

        <div class="sk-list" *ngIf="loading()" aria-busy="true"><div class="sk-row"></div><div class="sk-row"></div></div>
        <div class="err-msg" *ngIf="loadError()">{{ loadError() }}</div>

        <ng-container *ngIf="!loading() && !loadError()">
          <div class="perm-grid">
            <div class="perm-module" *ngFor="let mod of modules(); trackBy: trackModule" [class.perm-pages]="mod.label === 'Pages'">
              <div class="perm-mod-hdr">
                <label class="perm-check-lbl mod-check">
                  <input type="checkbox" [checked]="allOn(mod)" [indeterminate]="someOn(mod)" (change)="toggleModule(mod)" />
                  <span class="mod-name">{{ mod.label }}</span>
                </label>
              </div>
              <div class="perm-items">
                <label class="perm-check-lbl" *ngFor="let p of mod.perms; trackBy: trackPerm">
                  <input type="checkbox" [checked]="selected().has(p.key)" (change)="toggle(p.key)" />
                  <span>{{ p.label }}</span>
                </label>
              </div>
            </div>
          </div>

          <div class="err-msg" *ngIf="saveError()">{{ saveError() }}</div>
          <div class="actions">
            <span class="saved" *ngIf="saved()" role="status">✓ Droits enregistrés</span>
            <button type="button" class="btn btn-sm btn-outline" [disabled]="saving() || allSelected()" (click)="selectAll()">Tout cocher</button>
            <button type="button" class="btn btn-sm btn-primary" [disabled]="saving() || !dirty() || selectedCount() === 0" (click)="save()">
              {{ saving() ? 'Enregistrement…' : 'Enregistrer les droits' }}
            </button>
          </div>
          <p class="hint" *ngIf="selectedCount() === 0">Cochez au moins un droit.</p>
        </ng-container>
      </div>
    </div>
  `,
    styles: [`
    .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
    .section-card-hdr {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 14px 18px; border-bottom: 1px solid var(--border); background: var(--surface2);
    }
    .section-card-title { font-size: 13px; font-weight: 700; }
    .state { font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 10px; background: rgba(var(--accent-rgb), .15); color: var(--accent); }
    .state-open { background: rgba(52,168,83,.14); color: var(--success-text); }
    .body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
    .hint { margin: 0; font-size: 12px; color: var(--muted); line-height: 1.5; }
    .perm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .perm-module { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
    /* Les pages sont nombreuses : leur bloc prend toute la largeur, sur plusieurs colonnes */
    .perm-pages { grid-column: 1 / -1; }
    .perm-pages .perm-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 14px; }
    .perm-mod-hdr { padding: 8px 12px; background: rgba(var(--accent-rgb), .06); border-bottom: 1px solid var(--border); }
    .mod-name { font-size: 12px; font-weight: 700; }
    .perm-items { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
    .perm-check-lbl { display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer; color: var(--text); }
    .perm-check-lbl input { accent-color: var(--accent); cursor: pointer; }
    .perm-check-lbl.mod-check { font-weight: 700; }
    .actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .saved { font-size: 12px; color: var(--success-text); margin-right: auto; }
    .btn-sm { padding: 5px 12px; font-size: 11px; }
    .err-msg { font-size: 12px; color: var(--danger-text); }
  `]
})
export class TenantPermissionsComponent implements OnChanges {
  @Input({ required: true }) tenantId!: string;
  @Input() tenantName = '';

  private tenantSvc  = inject(TenantService);
  private destroyRef = inject(DestroyRef);

  loading   = signal(false);
  loadError = signal('');
  saving    = signal(false);
  saveError = signal('');
  saved     = signal(false);

  catalog    = signal<PermissionItem[]>([]);
  restricted = signal(false);
  selected   = signal<ReadonlySet<string>>(new Set());
  private _initial = signal<ReadonlySet<string>>(new Set());

  /** Droits regroupés par module ; « Pages » en premier. */
  modules = computed<PermModule[]>(() => {
    const map = new Map<string, PermissionItem[]>();
    for (const p of this.catalog()) {
      if (!map.has(p.module)) map.set(p.module, []);
      map.get(p.module)!.push(p);
    }
    return [...map.entries()].map(([label, perms]) => ({ label, perms }))
      .sort((a, b) => (a.label === 'Pages' ? -1 : b.label === 'Pages' ? 1 : a.label.localeCompare(b.label, 'fr')));
  });

  selectedCount = computed(() => this.selected().size);
  allSelected   = computed(() => this.catalog().length > 0 && this.selected().size === this.catalog().length);
  dirty = computed(() => {
    const a = this.selected(), b = this._initial();
    return a.size !== b.size || [...a].some(k => !b.has(k));
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId']) this._load();
  }

  private _load(): void {
    const id = this.tenantId;
    this.loading.set(true); this.loadError.set(''); this.saveError.set(''); this.saved.set(false);
    this.tenantSvc.getPermissions(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        if (id !== this.tenantId) return;   // une autre entreprise a été choisie entre-temps
        this.catalog.set(data.catalog);
        this.restricted.set(data.restricted);
        this.selected.set(new Set(data.allowed));
        this._initial.set(new Set(data.allowed));
        this.loading.set(false);
      },
      error: err => {
        if (id !== this.tenantId) return;
        this.loadError.set(httpErrorMessage(err));
        this.loading.set(false);
      },
    });
  }

  toggle(key: string): void {
    const next = new Set(this.selected());
    next.has(key) ? next.delete(key) : next.add(key);
    this.selected.set(next); this.saved.set(false);
  }

  allOn(mod: PermModule): boolean  { return mod.perms.every(p => this.selected().has(p.key)); }
  someOn(mod: PermModule): boolean { return mod.perms.some(p => this.selected().has(p.key)) && !this.allOn(mod); }

  toggleModule(mod: PermModule): void {
    const next = new Set(this.selected());
    const on = !this.allOn(mod);
    for (const p of mod.perms) on ? next.add(p.key) : next.delete(p.key);
    this.selected.set(next); this.saved.set(false);
  }

  selectAll(): void {
    this.selected.set(new Set(this.catalog().map(p => p.key))); this.saved.set(false);
  }

  save(): void {
    const id = this.tenantId, keys = [...this.selected()];
    this.saving.set(true); this.saveError.set(''); this.saved.set(false);
    this.tenantSvc.setPermissions(id, keys).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (id !== this.tenantId) return;
        this._initial.set(new Set(keys));
        this.restricted.set(keys.length < this.catalog().length);
        this.saving.set(false); this.saved.set(true);
      },
      error: err => {
        if (id !== this.tenantId) return;
        this.saveError.set(httpErrorMessage(err));
        this.saving.set(false);
      },
    });
  }

  trackModule(_: number, m: PermModule): string { return m.label; }
  trackPerm(_: number, p: PermissionItem): string { return p.key; }
}
