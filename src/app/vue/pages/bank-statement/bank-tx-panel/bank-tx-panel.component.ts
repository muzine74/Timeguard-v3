import {
  Component, ChangeDetectionStrategy, DestroyRef, ElementRef, EventEmitter, HostListener, Input, OnInit, Output,
  ViewChild, AfterViewInit, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, switchMap, catchError, of } from 'rxjs';
import {
  BankTransactionsService, BankTransactionRow, BankTransactionRef, BankMatch, BankMatchCandidate, BankMatchCandidates, BankMatchTarget, txRef,
} from '../../../../state/bank/bank-transactions.service';
import { AttachmentsService, AttachmentItem, ATTACHMENT_EXTENSIONS, ATTACHMENT_MAX_COUNT } from '../../../../state/attachments/attachments.service';
import { ConfirmService } from '../../../../state/ui/confirm.service';
import { downloadBlob } from '../../../shared/download';
import { httpErrorMessage } from '../../../shared/http-error';
import { locale } from '../../../../state/i18n/i18n.service';


/**
 * Suivi d'une transaction du relevé : transaction d'annulation / initiale, factures ou charge associées,
 * note, pièces jointes. Chaque modification est enregistrée tout de suite et renvoyée au relevé (changed).
 */
@Component({
  selector: 'app-bank-tx-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './bank-tx-panel.component.html',
  styleUrls: ['./bank-tx-panel.component.scss'],
})
export class BankTxPanelComponent implements OnInit, AfterViewInit {
  private svc        = inject(BankTransactionsService);
  private files      = inject(AttachmentsService);
  private confirm    = inject(ConfirmService);
  private destroyRef = inject(DestroyRef);

  /** Ligne affichée ; remplacée par le parent après chaque enregistrement. */
  @Input({ required: true }) set row(r: BankTransactionRow) {
    const prev = this._row();
    this._row.set(r);
    // Note : le brouillon suit la ligne tant qu'il n'est pas modifié
    if (!prev || prev.bankTransactionId !== r.bankTransactionId || this.noteDraft() === (prev.note ?? '')) this.noteDraft.set(r.note ?? '');
  }
  get row(): BankTransactionRow { return this._row()!; }
  /** Associer / retirer une facture change son statut : réservé au droit invoices.edit. */
  @Input() canEditInvoices = false;
  @Output() changed = new EventEmitter<BankTransactionRow>();
  @Output() goTo    = new EventEmitter<BankTransactionRef>();
  @Output() closed  = new EventEmitter<void>();

  @ViewChild('dlg') private dlg?: ElementRef<HTMLElement>;

  private _row = signal<BankTransactionRow | null>(null);
  readonly r = computed(() => this._row()!);
  readonly txRef = txRef;
  readonly accept = ATTACHMENT_EXTENSIONS.join(',');
  readonly maxFiles = ATTACHMENT_MAX_COUNT;
  /** Appareil tactile (téléphone, tablette) : propose « Prendre une photo ». */
  readonly canTakePhoto = typeof window !== 'undefined'
    && (window.matchMedia?.('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  busy  = signal(false);
  error = signal('');

  ngOnInit(): void {
    this._search$.pipe(
      debounceTime(250),
      switchMap(q => {
        this.candLoading.set(true);
        return this.svc.candidates(this.row.bankTransactionId, q).pipe(
          catchError(err => { this.candError.set(httpErrorMessage(err, `Impossible de charger les propositions`)); return of(null); }));
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(c => { this.candLoading.set(false); if (c) { this.candError.set(''); this.cands.set(c); } });
    if (this.row.matchKind) this._search$.next('');
  }

  ngAfterViewInit(): void { setTimeout(() => this.dlg?.nativeElement.focus()); }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.confirm.current() || this.renaming()) return;   // la fenêtre de confirmation / le renommage d'abord
    this.close();
  }

  async close(): Promise<void> {
    if (this.noteDirty() && !await this.confirm.discard('La note n\'est pas enregistrée.')) return;
    this.closed.emit();
  }

  amount(r: { withdrawal: number | null; deposit: number | null }): number { return r.deposit ?? r.withdrawal ?? 0; }

  fmt(val: number | null | undefined): string {
    return val == null ? '' : val.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $';
  }

  when(iso: string | null | undefined): string {
    return iso ? new Date(iso).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }

  /** Le parent garde la ligne à jour (liste, recherche, export). */
  private _emit(row: BankTransactionRow): void { this._row.set(row); this.changed.emit(row); }

  // ── Annulation ────────────────────────────────────────────────────────────
  open(ref: BankTransactionRef): void { this.goTo.emit(ref); }

  // ── Rapprochement ─────────────────────────────────────────────────────────
  private _search$ = new Subject<string>();
  search      = signal('');
  cands       = signal<BankMatchCandidates | null>(null);
  candLoading = signal(false);
  candError   = signal('');

  readonly matched = computed(() => this.r().matches ?? []);
  readonly matchedTotal = computed(() => Math.round(this.matched().reduce((s, m) => s + m.amount, 0) * 100) / 100);
  readonly gap = computed(() => Math.round((this.amount(this.r()) - this.matchedTotal()) * 100) / 100);
  readonly canAdd = computed(() => this.r().matchKind === 'charge' || this.canEditInvoices);

  setSearch(q: string): void { this.search.set(q); this._search$.next(q.trim()); }

  async associate(c: BankMatchCandidate): Promise<void> {
    if (this.busy() || !this.canAdd() || c.linkedTo) return;
    const prev = this.matched()[0];
    if (c.targetType === 'charge' && prev
        && !await this.confirm.ask({ title: 'Remplacer la charge associée ?', message: `${prev.label ?? ''} → ${c.label}`, confirmLabel: 'Remplacer' })) return;
    this._run(this.svc.addMatch(this.row.bankTransactionId, c), `L'association n'a pas été enregistrée`, () => this._search$.next(this.search().trim()));
  }

  async unlink(m: BankMatch): Promise<void> {
    if (this.busy()) return;
    const what = m.targetType === 'bill' ? 'Retirer la facture ?' : 'Retirer la charge ?';
    const msg = m.targetType === 'bill' && m.setBillPaid && m.isPaid ? 'La facture redeviendra non payée.' : undefined;
    if (!await this.confirm.ask({ title: what, message: msg, confirmLabel: 'Retirer', danger: true })) return;
    this._run(this.svc.removeMatch(this.row.bankTransactionId, m.id), `L'association n'a pas été retirée`, () => this._search$.next(this.search().trim()));
  }

  targetIcon(t: BankMatchTarget): string { return t === 'bill' ? '🧾' : '💼'; }

  // ── Note ──────────────────────────────────────────────────────────────────
  readonly maxNote = 1000;
  noteDraft = signal('');
  readonly noteDirty = computed(() => this.noteDraft().trim() !== (this.r().note ?? '').trim());

  saveNote(): void {
    if (this.busy() || !this.noteDirty()) return;
    this._run(this.svc.setNote(this.row.bankTransactionId, this.noteDraft()), `La note n'a pas été enregistrée`,
              () => this.noteDraft.set(this.r().note ?? ''));
  }

  resetNote(): void { this.noteDraft.set(this.r().note ?? ''); }

  private _run(obs: ReturnType<BankTransactionsService['get']>, fail: string, after?: () => void): void {
    this.busy.set(true);
    this.error.set('');
    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: row => { this.busy.set(false); this._emit(row); after?.(); },
      error: err => { this.busy.set(false); this.error.set(httpErrorMessage(err, fail)); },
    });
  }

  // ── Pièces jointes ────────────────────────────────────────────────────────
  readonly atts = computed(() => this.r().attachments ?? (this.r().attachment ? [this.r().attachment!] : []));
  attBusy  = signal(false);
  attErrors = signal<string[]>([]);
  renaming = signal<string | null>(null);   // pièce en cours de renommage
  renameDraft = signal('');

  @ViewChild('renameInput') set _renameInput(el: ElementRef<HTMLInputElement> | undefined) {
    if (el) setTimeout(() => { el.nativeElement.focus(); el.nativeElement.select(); });
  }

  private _setAtts(list: AttachmentItem[]): void {
    const last = list.length ? list[list.length - 1] : null;
    this._emit({ ...this.r(), attachments: list, attachment: last, attachmentUrl: last ? `/api/attachments/${last.id}/download` : null });
  }

  pick(input: HTMLInputElement): void {
    if (this.attBusy() || this.atts().length >= this.maxFiles) return;
    input.value = '';
    input.click();
  }

  onFiles(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (!picked.length) return;
    const errors: string[] = [];
    const ok: File[] = [];
    for (const f of picked) {
      const why = this.files.check(f);
      if (why) { errors.push(`${f.name} : ${why}`); continue; }
      if (this.atts().length + ok.length >= this.maxFiles) { errors.push(`${f.name} : maximum de ${this.maxFiles} pièces jointes atteint`); continue; }
      ok.push(f);
    }
    this.attErrors.set(errors);
    if (!ok.length) return;
    const id = this.row.bankTransactionId;
    this.attBusy.set(true);
    this.files.uploadAll('bank', id, ok).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(res => {
      this.attBusy.set(false);
      this.attErrors.set([...errors, ...res.errors]);
      if (res.uploaded.length && this.row.bankTransactionId === id) this._setAtts([...this.atts(), ...res.uploaded]);
    });
  }

  /** Ouvre le document dans un nouvel onglet (fichier récupéré avec la session). */
  openFile(a: AttachmentItem): void {
    this.attErrors.set([]);
    // Onglet ouvert tout de suite (sinon bloqué comme fenêtre surgissante), rempli à la réception
    const win = window.open('', '_blank');
    this.files.download(a.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        if (!win) { downloadBlob(blob, a.name); return; }
        const url = URL.createObjectURL(blob);
        win.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: err => { win?.close(); this.attErrors.set([`${a.name} : ${httpErrorMessage(err, `Impossible d'ouvrir la pièce jointe`)}`]); },
    });
  }

  downloadFile(a: AttachmentItem): void {
    this.attErrors.set([]);
    this.files.download(a.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => downloadBlob(blob, a.name),
      error: err => this.attErrors.set([`${a.name} : ${httpErrorMessage(err, `Le téléchargement a échoué`)}`]),
    });
  }

  extOf(name: string): string { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i) : ''; }

  startRename(a: AttachmentItem): void {
    const ext = this.extOf(a.name);
    this.renameDraft.set(ext ? a.name.slice(0, -ext.length) : a.name);
    this.renaming.set(a.id);
  }

  cancelRename(): void { this.renaming.set(null); }

  saveRename(a: AttachmentItem): void {
    const name = this.renameDraft().trim();
    if (this.attBusy()) return;
    if (!name) { this.attErrors.set(['Indiquez un nom.']); return; }
    const full = name + this.extOf(a.name);
    if (full === a.name) { this.renaming.set(null); return; }
    this.attBusy.set(true);
    this.files.rename(a.id, full).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: item => {
        this.attBusy.set(false);
        this.renaming.set(null);
        this._setAtts(this.atts().map(x => x.id === item.id ? item : x));
      },
      error: err => { this.attBusy.set(false); this.attErrors.set([httpErrorMessage(err, `La pièce jointe n'a pas été renommée`)]); },
    });
  }

  async removeFile(a: AttachmentItem): Promise<void> {
    if (this.attBusy() || !await this.confirm.danger('Supprimer la pièce jointe ?', a.name)) return;
    this.attBusy.set(true);
    this.files.delete(a.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.attBusy.set(false); this._setAtts(this.atts().filter(x => x.id !== a.id)); },
      error: err => { this.attBusy.set(false); this.attErrors.set([httpErrorMessage(err, `La pièce jointe n'a pas été supprimée`)]); },
    });
  }

  size(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  }
}
