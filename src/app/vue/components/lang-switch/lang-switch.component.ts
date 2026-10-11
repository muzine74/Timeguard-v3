import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService, LANGS, Lang } from '../../../state/i18n/i18n.service';

/** Choix de la langue d'affichage (français, anglais, espagnol, italien). Mémorisé dans le navigateur. */
@Component({
    selector: 'app-lang-switch',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    template: `
    <div class="ls" role="radiogroup" aria-label="Langue / Language" data-no-i18n>
      <button *ngFor="let l of langs" type="button" role="radio" class="ls-opt"
              [class.active]="i18n.lang() === l.id" [attr.aria-checked]="i18n.lang() === l.id"
              [attr.lang]="l.id" [title]="l.label" [attr.aria-label]="l.label" [disabled]="i18n.loading()"
              (click)="choose(l.id)">{{ l.short }}</button>
    </div>
  `,
    styles: [`
    :host { display: inline-flex; }
    .ls { display: inline-flex; gap: 2px; padding: 2px; border-radius: 9px; background: var(--surface2); border: 1px solid var(--border); }
    .ls-opt {
      min-width: 32px; padding: 4px 7px; border: 0; border-radius: 7px; background: none; cursor: pointer;
      color: var(--muted); font-family: inherit; font-size: 11px; font-weight: 700; letter-spacing: .3px; transition: all .15s;
    }
    .ls-opt:hover { color: var(--text); }
    .ls-opt.active { background: var(--accent); color: var(--on-accent); }
    .ls-opt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .ls-opt:disabled { opacity: .6; cursor: default; }
  `]
})
export class LangSwitchComponent {
  readonly langs = LANGS;
  constructor(public i18n: I18nService) {}
  choose(lang: Lang): void { if (lang !== this.i18n.lang()) void this.i18n.use(lang); }
}
