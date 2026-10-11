import { Component, ChangeDetectionStrategy, ElementRef, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface MultiSelectOption { id: string; label: string; }

/**
 * Menu déroulant à cases à cocher (sélection multiple), même rendu que le sélecteur
 * d'employés de la page Paiements. Usage : <app-multi-select [options] [(selected)] placeholder="…">.
 */
@Component({
    selector: 'app-multi-select',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    template: `
    <button #btn type="button" class="ms-toggle" [class.ms-active]="selected.length" (click)="toggleOpen(btn)"
            [attr.aria-expanded]="open">
      <span class="ms-label">{{ summary() }}</span>
      <span class="ms-caret">▾</span>
    </button>
    <div class="ms-panel" *ngIf="open" [ngStyle]="panelStyle">
      <input *ngIf="options.length > 8" class="ms-search" type="search" placeholder="Rechercher…"
             [(ngModel)]="query" />
      <label class="ms-item ms-all" *ngIf="visible().length > 0">
        <input type="checkbox" [checked]="allState() === 'all'" [indeterminate]="allState() === 'some'"
               (change)="toggleAll()" />
        <span>{{ query.trim() ? 'Tout sélectionner (résultats)' : 'Tout sélectionner' }}</span>
      </label>
      <label class="ms-item" *ngFor="let o of visible(); trackBy: trackById">
        <input type="checkbox" [checked]="isSelected(o.id)" (change)="toggle(o.id)" />
        <span>{{ o.label }}</span>
      </label>
      <div class="ms-empty" *ngIf="visible().length === 0">Aucun résultat</div>
    </div>
  `,
    styles: [`
    :host { position: relative; display: block; flex: 1 1 170px; min-width: 0; }
    .ms-toggle {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
      background: var(--bg); color: var(--muted); font-size: .9rem; font-family: inherit; cursor: pointer; text-align: left;
    }
    .ms-toggle:hover, .ms-toggle:focus { border-color: var(--accent); outline: none; }
    .ms-active { color: var(--text); border-color: rgba(var(--accent-rgb), .5); }
    .ms-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ms-caret { font-size: .7rem; flex-shrink: 0; }
    .ms-panel {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 30;
      min-width: 100%; width: max-content; max-width: 320px; max-height: 320px; overflow-y: auto;
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .ms-search {
      width: 100%; box-sizing: border-box; margin-bottom: 6px; padding: 7px 10px;
      border: 1px solid var(--border); border-radius: 7px; background: var(--bg); color: var(--text); font-family: inherit;
    }
    .ms-search:focus { outline: none; border-color: var(--accent); }
    .ms-item {
      display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 7px;
      font-size: .85rem; color: var(--text); cursor: pointer;
    }
    .ms-item:hover { background: rgba(var(--overlay-rgb), .04); }
    .ms-item input { accent-color: var(--accent); }
    .ms-empty { padding: 8px 10px; font-size: .8rem; color: var(--muted); }
    .ms-all {
      font-weight: 600; border-bottom: 1px solid var(--border);
      border-radius: 7px 7px 0 0; margin-bottom: 4px; padding-bottom: 9px;
    }
    /* Dans un en-tête de colonne : plus petit, sans hériter des majuscules de l'en-tête */
    :host(.compact) { flex: none; width: 190px; max-width: 100%; text-transform: none; letter-spacing: normal; font-weight: 400; }
    :host(.compact) .ms-toggle { padding: 5px 9px; font-size: .78rem; border-radius: 7px; }
  `]
})
export class MultiSelectComponent {
  @Input() options: MultiSelectOption[] = [];
  @Input() selected: string[] = [];
  @Output() selectedChange = new EventEmitter<string[]>();
  /** Texte quand rien n'est coché (ex. « Tous les employés »). */
  @Input() placeholder = 'Tous';
  /** Nom au pluriel pour le résumé (ex. « employés » → « 3 employés »). */
  @Input() plural = 'éléments';
  /**
   * Liste posée par-dessus la page (position fixe) au lieu d'être rattachée au bouton : à utiliser dans un
   * tableau, dont le cadre défilant couperait la liste.
   */
  @Input() floating = false;

  panelStyle: Record<string, string> | null = null;
  open  = false;
  query = '';

  constructor(private host: ElementRef<HTMLElement>) {}

  // pointerdown (et non click) : fonctionne même si un parent stoppe la propagation du click.
  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(ev: Event): void {
    if (this.open && !this.host.nativeElement.contains(ev.target as Node)) this.open = false;
  }

  toggleOpen(btn: HTMLElement): void {
    this.open = !this.open;
    if (!this.open || !this.floating) { this.panelStyle = null; return; }
    const r = btn.getBoundingClientRect();
    // Sous le bouton s'il y a la place, sinon au-dessus (bouton en bas de l'écran)
    const below = window.innerHeight - r.bottom - 16, above = r.top - 16;
    const down = below >= 200 || below >= above;
    this.panelStyle = {
      position: 'fixed', left: `${Math.max(8, Math.min(r.left, window.innerWidth - 328))}px`,
      top: down ? `${r.bottom + 6}px` : 'auto', bottom: down ? 'auto' : `${window.innerHeight - r.top + 6}px`,
      'min-width': `${r.width}px`, 'max-height': `${Math.min(320, down ? below : above)}px`,
    };
  }

  // Liste en position fixe : elle ne suit pas le bouton quand la page défile, donc on la ferme
  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.open && this.floating) this.open = false;
  }

  summary(): string {
    const n = this.selected.length;
    if (n === 0) return this.placeholder;
    if (n === 1) return this.options.find(o => o.id === this.selected[0])?.label ?? `1 ${this.plural}`;
    return `${n} ${this.plural}`;
  }

  visible(): MultiSelectOption[] {
    const q = this.query.trim().toLowerCase();
    return q ? this.options.filter(o => o.label.toLowerCase().includes(q)) : this.options;
  }

  isSelected(id: string): boolean {
    return this.selected.includes(id);
  }

  toggle(id: string): void {
    this.selectedChange.emit(this.isSelected(id) ? this.selected.filter(s => s !== id) : [...this.selected, id]);
  }

  /** État de « Tout sélectionner » sur les éléments visibles (tient compte de la recherche). */
  allState(): 'none' | 'some' | 'all' {
    const vis = this.visible();
    const n = vis.filter(o => this.isSelected(o.id)).length;
    return n === 0 ? 'none' : n === vis.length ? 'all' : 'some';
  }

  /** Coche tous les éléments visibles, ou les décoche tous s'ils l'étaient déjà. */
  toggleAll(): void {
    const ids = this.visible().map(o => o.id);
    this.selectedChange.emit(this.allState() === 'all'
      ? this.selected.filter(id => !ids.includes(id))
      : [...this.selected, ...ids.filter(id => !this.selected.includes(id))]);
  }

  trackById(_: number, o: MultiSelectOption): string {
    return o.id;
  }
}
