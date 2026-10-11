import { Component, ChangeDetectionStrategy, ElementRef, HostListener, ViewChild, computed, effect, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { NoteLinkOptionsService } from '../../../state/notes/note-link-options.service';
import { IconComponent } from '../icon/icon.component';
import { QuickSearchService } from '../../../state/ui/quick-search.service';

interface Result { kind: 'page' | 'employee' | 'company' | 'bill'; label: string; hint: string; icon: string; link: string; }

/**
 * Fenêtre de la recherche globale (bouton de la barre, ou Ctrl+K / ⌘K) : une page du menu, un employé, une compagnie
 * ou une facture, selon les permissions de l'utilisateur. Entrée ouvre le premier résultat.
 */
@Component({
    selector: 'app-quick-search',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, IconComponent],
    template: `
    <div class="qs-backdrop" *ngIf="isOpen()" (click)="close()">
      <div class="qs-box" role="dialog" aria-modal="true" aria-label="Recherche" (click)="$event.stopPropagation()">
        <div class="qs-input-row">
          <app-icon name="search"></app-icon>
          <input #input type="search" class="qs-input" autocomplete="off" spellcheck="false"
                 placeholder="Page, employé, compagnie, facture…" aria-label="Rechercher"
                 role="combobox" aria-expanded="true" aria-controls="qs-results" [attr.aria-activedescendant]="results().length ? 'qs-r-' + active() : null"
                 [value]="query()" (input)="onInput($any($event.target).value)" (keydown)="onKey($event)" />
          <button type="button" class="qs-close" (click)="close()" aria-label="Fermer la recherche"><app-icon name="close"></app-icon></button>
        </div>

        <ul class="qs-results" id="qs-results" role="listbox" *ngIf="results().length">
          <li *ngFor="let r of results(); let i = index" role="option" class="qs-result" [id]="'qs-r-' + i"
              [class.active]="i === active()" [attr.aria-selected]="i === active()"
              (mouseenter)="active.set(i)" (click)="go(r)">
            <span class="qs-icon"><app-icon [name]="r.icon"></app-icon></span>
            <span class="qs-label">{{ r.label }}</span>
            <span class="qs-hint">{{ r.hint }}</span>
          </li>
        </ul>
        <div class="qs-empty" *ngIf="!results().length">
          {{ query().trim() ? 'Aucun résultat pour « ' + query().trim() + ' ».' : 'Tapez le nom d\\'une page, d\\'un employé, d\\'une compagnie ou un numéro de facture.' }}
        </div>
        <div class="qs-foot" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> choisir · <kbd>Entrée</kbd> ouvrir · <kbd>Échap</kbd> fermer</div>
      </div>
    </div>
  `,
    styles: [`
    kbd {
      font-family: inherit; font-size: 10px; font-weight: 600; color: var(--muted);
      border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; background: var(--surface);
    }

    .qs-backdrop {
      position: fixed; inset: 0; z-index: 2500; background: rgba(0, 0, 0, .55);
      display: flex; justify-content: center; align-items: flex-start; padding: 12vh 16px 16px;
    }
    .qs-box {
      width: 100%; max-width: 560px; max-height: 70vh; display: flex; flex-direction: column;
      background: var(--surface); color: var(--text);
      border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
      box-shadow: 0 18px 50px rgba(0, 0, 0, .4);
    }
    .qs-input-row { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--muted); }
    .qs-input-row > app-icon { font-size: 18px; }
    .qs-input {
      flex: 1; min-width: 0; background: none; border: 0; outline: none;
      color: var(--text); font-family: inherit; font-size: 15px;
    }
    .qs-input::placeholder { color: var(--muted); }
    .qs-input::-webkit-search-cancel-button { display: none; }
    .qs-close { background: none; border: 0; padding: 4px; color: var(--muted); cursor: pointer; font-size: 16px; display: inline-flex; border-radius: 6px; }
    .qs-close:hover { color: var(--text); }
    .qs-results { list-style: none; margin: 0; padding: 6px; overflow-y: auto; }
    .qs-result {
      display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 9px; cursor: pointer; font-size: 13px;
    }
    .qs-result.active { background: rgba(var(--accent-rgb), .12); }
    .qs-icon {
      width: 28px; height: 28px; border-radius: 8px; flex-shrink: 0; font-size: 14px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(var(--accent-rgb), .12); color: var(--accent);
    }
    .qs-label { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qs-hint  { flex-shrink: 0; font-size: 11px; color: var(--muted); }
    .qs-empty { padding: 26px 18px; text-align: center; font-size: 13px; color: var(--muted); }
    .qs-foot  { padding: 8px 14px; border-top: 1px solid var(--border); font-size: 11px; color: var(--muted); }
    .qs-foot kbd { margin-right: 3px; }
    @media (max-width: 640px) { .qs-foot { display: none; } .qs-backdrop { padding-top: 8vh; } }
  `]
})
export class QuickSearchComponent {
  @ViewChild('input') input?: ElementRef<HTMLInputElement>;

  readonly isOpen = this.state.isOpen;
  query  = signal('');
  active = signal(0);

  private static readonly MAX_PER_KIND = 6;

  readonly results = computed<Result[]>(() => {
    const q = this._norm(this.query());
    const pages = this.state.pages()
      .filter(p => !q || this._norm(p.label).includes(q) || this._norm(p.group).includes(q))
      .map(p => ({ kind: 'page' as const, label: p.label, hint: p.group, icon: p.icon, link: p.link }));
    if (!q) return pages.slice(0, 8);

    const pick = (type: 'employee' | 'company' | 'bill', hint: string, icon: string, link: (id: string) => string) =>
      this.options.options(type)
        .filter(o => this._norm(o.label).includes(q))
        .slice(0, QuickSearchComponent.MAX_PER_KIND)
        .map(o => ({ kind: type, label: o.label, hint, icon, link: link(o.id) }));

    return [
      ...pages.slice(0, QuickSearchComponent.MAX_PER_KIND),
      ...(this._can('employees.view') ? pick('employee', 'Employé', 'user', id => `/employees/${id}`) : []),
      ...(this._can('companies.edit') ? pick('company', 'Compagnie', 'building', id => `/companies/${id}/edit`) : []),
      ...(this._can('invoices.view')  ? pick('bill', 'Facture', 'file', () => '/invoices') : []),
    ];
  });

  constructor(private router: Router, private auth: AuthService, private options: NoteLinkOptionsService,
              private state: QuickSearchService) {
    // À chaque ouverture (bouton ou raccourci) : listes chargées, champ vidé, curseur dans le champ
    effect(() => { if (this.state.isOpen()) untracked(() => this._prepare()); });
  }

  private _can(perm: string): boolean { return this.auth.isSuperUser() || this.auth.hasPerm(perm); }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(ev: KeyboardEvent): void {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      if (this.auth.loggedIn() && !this.auth.isSuperUser()) this.state.toggle();
    } else if (ev.key === 'Escape' && this.isOpen()) {
      ev.preventDefault();
      this.close();
    }
  }

  private _prepare(): void {
    // Listes chargées à la première ouverture, seulement celles que l'utilisateur a le droit de lire
    if (this._can('employees.view')) this.options.ensure('employee', true);
    if (this._can('companies.edit')) this.options.ensure('company', true);
    if (this._can('invoices.view'))  this.options.ensure('bill', true);
    this.query.set('');
    this.active.set(0);
    setTimeout(() => this.input?.nativeElement.focus());
  }

  close(): void { this.state.close(); }

  onInput(value: string): void { this.query.set(value); this.active.set(0); }

  onKey(ev: KeyboardEvent): void {
    const n = this.results().length;
    if (ev.key === 'ArrowDown')      { ev.preventDefault(); if (n) this.active.set((this.active() + 1) % n); this._scroll(); }
    else if (ev.key === 'ArrowUp')   { ev.preventDefault(); if (n) this.active.set((this.active() - 1 + n) % n); this._scroll(); }
    else if (ev.key === 'Enter')     { ev.preventDefault(); const r = this.results()[this.active()]; if (r) this.go(r); }
  }

  go(r: Result): void {
    this.close();
    this.router.navigateByUrl(r.link);
  }

  private _scroll(): void {
    setTimeout(() => document.getElementById('qs-r-' + this.active())?.scrollIntoView({ block: 'nearest' }));
  }

  /** Minuscules, sans accents (« hotel » trouve « Hôtel »). */
  private _norm(s: string): string {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
}
