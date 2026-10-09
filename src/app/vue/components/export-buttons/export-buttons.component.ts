import { Component, ChangeDetectionStrategy, Input, signal, inject, ElementRef, HostListener, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableExportService, ExportDoc } from '../../../state/export/table-export.service';

type ExportFormat = 'pdf' | 'excel' | 'csv';

const FORMATS: { id: ExportFormat; label: string; hint: string; icon: string }[] = [
  { id: 'pdf',   label: 'PDF',   hint: 'Document imprimable',          icon: '📄' },
  { id: 'excel', label: 'Excel', hint: 'Classeur .xlsx mis en forme',  icon: '📊' },
  { id: 'csv',   label: 'CSV',   hint: 'Données brutes (séparateur ;)', icon: '🧾' },
];

/**
 * Bouton unique « Exporter ▾ » : un menu propose PDF, Excel ou CSV. La page fournit `build`,
 * qui renvoie le document à exporter à partir de ce qui est affiché (filtres et tri appliqués).
 *   <app-export-buttons [build]="exportPayments" [disabled]="!rows().length" label="les paiements employés" />
 */
@Component({
    selector: 'app-export-buttons',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
    <div class="exp-wrap">
      <button type="button" class="exp-btn" [disabled]="disabled || busy() !== null"
              aria-haspopup="menu" [attr.aria-expanded]="open()" [attr.aria-label]="'Exporter ' + label"
              (click)="toggle()" (keydown.arrowdown)="openMenu($event)">
        <span aria-hidden="true">⬇</span>
        {{ busy() ? 'Export ' + busyLabel() + '…' : 'Exporter' }}
        <span class="exp-caret" aria-hidden="true">▾</span>
      </button>
      <div class="exp-menu" role="menu" *ngIf="open()" [attr.aria-label]="'Format d\\'export de ' + label"
           (keydown)="onMenuKey($event)">
        <button #item type="button" role="menuitem" class="exp-item" *ngFor="let f of formats" (click)="run(f.id)">
          <span class="exp-icon" aria-hidden="true">{{ f.icon }}</span>
          <span class="exp-txt"><strong>{{ f.label }}</strong><small>{{ f.hint }}</small></span>
        </button>
      </div>
      <span class="exp-err" role="alert" *ngIf="error()">{{ error() }}</span>
    </div>
  `,
    styles: [`
    :host { display: inline-flex; }
    .exp-wrap { position: relative; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .exp-btn {
      display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 5px 12px; border-radius: 8px;
      background: transparent; border: 1px solid var(--border); color: var(--text);
      font: inherit; font-size: 12px; font-weight: 600; text-transform: none; letter-spacing: 0; cursor: pointer;
    }
    .exp-btn:hover:not(:disabled) { background: var(--surface2); border-color: rgba(var(--accent-rgb), .5); }
    .exp-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .exp-btn:disabled { opacity: .5; cursor: not-allowed; }
    .exp-caret { color: var(--muted); font-size: 11px; }
    .exp-menu {
      position: absolute; top: calc(100% + 6px); right: 0; z-index: 50; min-width: 230px; padding: 6px;
      background: var(--surface); border: 1px solid var(--border); border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, .25);
    }
    .exp-item {
      display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 7px 10px; border-radius: 8px;
      background: none; border: none; color: var(--text); font: inherit; text-align: left; text-transform: none; letter-spacing: 0; cursor: pointer;
    }
    .exp-item:hover, .exp-item:focus-visible { background: var(--surface2); outline: none; }
    .exp-item:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
    .exp-icon { font-size: 16px; }
    .exp-txt { display: flex; flex-direction: column; gap: 1px; }
    .exp-txt strong { font-size: 13px; }
    .exp-txt small { font-size: 11px; color: var(--muted); font-weight: 400; }
    .exp-err { color: var(--danger-text); font-size: 12px; }
  `]
})
export class ExportButtonsComponent {
  @Input({ required: true }) build!: () => ExportDoc;
  @Input() disabled = false;
  /** Complément des libellés lus par les lecteurs d'écran (« Exporter <label> »). */
  @Input() label = 'le tableau';

  readonly formats = FORMATS;
  open  = signal(false);
  busy  = signal<ExportFormat | null>(null);
  error = signal('');

  @ViewChildren('item') private items!: QueryList<ElementRef<HTMLButtonElement>>;
  private exporter = inject(TableExportService);
  private host = inject(ElementRef<HTMLElement>);

  busyLabel(): string { return FORMATS.find(f => f.id === this.busy())?.label ?? ''; }

  toggle(): void {
    this.open() ? this.close(false) : this.openMenu();
  }

  openMenu(e?: Event): void {
    e?.preventDefault();
    this.error.set('');
    this.open.set(true);
    setTimeout(() => this.items?.first?.nativeElement.focus());
  }

  close(returnFocus = true): void {
    this.open.set(false);
    if (returnFocus) (this.host.nativeElement.querySelector('.exp-btn') as HTMLButtonElement | null)?.focus();
  }

  onMenuKey(e: KeyboardEvent): void {
    const list = this.items.toArray().map(i => i.nativeElement);
    const idx = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (n: number) => { e.preventDefault(); list[(idx + n + list.length) % list.length]?.focus(); };
    switch (e.key) {
      case 'ArrowDown': move(1); break;
      case 'ArrowUp':   move(-1); break;
      case 'Home':      e.preventDefault(); list[0]?.focus(); break;
      case 'End':       e.preventDefault(); list[list.length - 1]?.focus(); break;
      case 'Escape':    e.preventDefault(); this.close(); break;
      case 'Tab':       this.close(false); break;
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close(false);
  }

  async run(kind: ExportFormat): Promise<void> {
    this.close();
    this.error.set('');
    this.busy.set(kind);
    try {
      const doc = this.build();
      if (kind === 'excel')    await this.exporter.toExcel(doc);
      else if (kind === 'pdf') await this.exporter.toPdf(doc);
      else                     this.exporter.toCsv(doc);
    } catch (e) {
      console.error('[export]', e);
      this.error.set(`Échec de l'export ${FORMATS.find(f => f.id === kind)?.label}.`);
    } finally {
      this.busy.set(null);
    }
  }
}
