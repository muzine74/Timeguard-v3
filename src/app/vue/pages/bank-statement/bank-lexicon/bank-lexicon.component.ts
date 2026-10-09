import { Component, OnInit, Output, EventEmitter, signal, computed, ChangeDetectionStrategy, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import {
  BankTransactionsService, BankLexicon, BankLexiconEntry, BankLexiconTargets, BankLinkType,
} from '../../../../state/bank/bank-transactions.service';

export const LINK_LABEL: Record<BankLinkType, string> = { company: 'Compagnie', employee: 'Employé', charge: 'Charge' };
export const LINK_ICON:  Record<BankLinkType, string> = { company: '🏢', employee: '👤', charge: '🧾' };

/** Lexique du relevé bancaire : mots-clés reliés à une compagnie, un employé ou une charge. */
@Component({
    selector: 'app-bank-lexicon',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './bank-lexicon.component.html',
    styleUrls: ['./bank-lexicon.component.scss']
})
export class BankLexiconComponent implements OnInit {
  /** Le lexique a changé : les liens du relevé sont à recalculer. */
  @Output() changed = new EventEmitter<void>();

  private svc        = inject(BankTransactionsService);
  private destroyRef = inject(DestroyRef);

  readonly types: BankLinkType[] = ['company', 'employee', 'charge'];
  readonly label = LINK_LABEL;
  readonly icon  = LINK_ICON;

  loading = signal(true);
  error   = signal('');
  lexicon = signal<BankLexicon | null>(null);
  targets = signal<BankLexiconTargets>({ companies: [], employees: [], charges: [] });

  // Formulaire d'ajout
  keyword    = '';
  targetType = signal<BankLinkType>('company');
  targetId   = '';
  saving     = signal(false);
  formError  = signal('');
  message    = signal('');

  /** Suppression en deux clics : id du mot-clé en attente de confirmation. */
  confirmId = signal<string | null>(null);
  deleting  = signal<string | null>(null);

  targetOptions = computed(() => {
    const t = this.targets();
    return this.targetType() === 'company' ? t.companies : this.targetType() === 'employee' ? t.employees : t.charges;
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ lexicon: this.svc.getLexicon(), targets: this.svc.getLexiconTargets() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.lexicon.set(r.lexicon); this.targets.set(r.targets); this.loading.set(false); },
        error: err => { this.error.set(err?.error?.message ?? `Impossible de charger le lexique (HTTP ${err?.status ?? '?'}).`); this.loading.set(false); },
      });
  }

  private _refresh(): void {
    this.svc.getLexicon().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: l => this.lexicon.set(l) });
    this.changed.emit();
  }

  setType(t: BankLinkType): void { this.targetType.set(t); this.targetId = ''; }

  canAdd(): boolean { return this.keyword.trim().length >= 3 && !!this.targetId && !this.saving(); }

  add(): void {
    if (!this.canAdd()) return;
    this.saving.set(true);
    this.formError.set('');
    this.message.set('');
    const keyword = this.keyword.trim();
    this.svc.addLexiconEntry(keyword, this.targetType(), this.targetId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: e => {
        this.saving.set(false);
        this.message.set(`✓ « ${e.keyword} » relié à ${e.targetName ?? ''}.`);
        this.keyword = '';
        this._refresh();
      },
      error: err => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? `Le mot-clé n'a pas été enregistré (HTTP ${err?.status ?? '?'}).`);
      },
    });
  }

  /** Reprend une description sans lien comme mot-clé (à raccourcir au besoin). */
  useDescription(description: string, input: HTMLInputElement): void {
    this.keyword = description;
    this.formError.set('');
    this.message.set('');
    input.focus();
  }

  remove(e: BankLexiconEntry): void {
    if (this.confirmId() !== e.id) { this.confirmId.set(e.id); return; }
    this.confirmId.set(null);
    this.deleting.set(e.id);
    this.svc.deleteLexiconEntry(e.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.deleting.set(null); this.message.set(`Mot-clé « ${e.keyword} » supprimé.`); this._refresh(); },
      error: err => { this.deleting.set(null); this.error.set(err?.error?.message ?? `La suppression a échoué (HTTP ${err?.status ?? '?'}).`); },
    });
  }

  cancelRemove(): void { this.confirmId.set(null); }

  trackEntry(_: number, e: BankLexiconEntry): string { return e.id; }
}
