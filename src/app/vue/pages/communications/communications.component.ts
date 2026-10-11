import { Component, OnInit, OnDestroy, HostListener, computed, effect, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CommunicationsService, CommTarget, CommTargetType, CommChannel, CommDirection, Communication, CommSave, CommEmail,
} from '../../../state/communications/communications.service';
import { AttachmentsComponent } from '../../components/attachments/attachments.component';
import { AttachmentsService, AttachmentItem } from '../../../state/attachments/attachments.service';
import { ConfirmService } from '../../../state/ui/confirm.service';
import { TelephonyService, CallNumber } from '../../../state/telephony/telephony.service';
import { httpErrorMessage } from '../../shared/http-error';

interface CommForm {
  id:        string | null;      // null = nouvelle entrée
  when:      string;             // valeur du champ datetime-local (heure locale)
  channel:   CommChannel;
  direction: CommDirection;
  contact:   string;
  subject:   string;
  body:      string;
  sendEmail: boolean;            // nouveau courriel « Envoyé » : l'expédier à l'enregistrement
}

/** Historique de communication par compagnie et par employé : courriels envoyés par TimeGuard
 *  (enregistrés automatiquement, en lecture seule) et entrées saisies à la main. */
@Component({
    selector: 'app-communications',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule, AttachmentsComponent],
    templateUrl: './communications.component.html',
    styleUrls: ['./communications.component.scss']
})
export class CommunicationsComponent implements OnInit, OnDestroy {
  private readonly confirmDlg = inject(ConfirmService);
  readonly tel = inject(TelephonyService);

  readonly CALL_STATUS: Record<string, string> = {
    'pending': 'Non abouti', 'in-progress': 'En cours', 'completed': 'Terminé', 'no-answer': 'Sans réponse',
    'busy': 'Occupé', 'failed': 'Échec', 'canceled': 'Annulé',
  };

  readonly CHANNELS: { key: CommChannel; label: string; icon: string }[] = [
    { key: 'email',   label: 'Courriel',  icon: '✉' },
    { key: 'call',    label: 'Appel',     icon: '📞' },
    { key: 'meeting', label: 'Rencontre', icon: '🤝' },
    { key: 'sms',     label: 'Texto',     icon: '💬' },
    { key: 'other',   label: 'Autre',     icon: '📝' },
  ];

  // ── Listes de gauche ──────────────────────────────────
  companies     = signal<CommTarget[]>([]);
  employees     = signal<CommTarget[]>([]);
  canCompanies  = signal(false);
  canEmployees  = signal(false);
  targetsLoading = signal(true);
  targetsError  = signal('');
  tab           = signal<CommTargetType>('company');
  search        = signal('');
  showInactive  = signal(false);

  // ── Historique de l'élément choisi ────────────────────
  selected  = signal<CommTarget | null>(null);
  items     = signal<Communication[]>([]);
  loading   = signal(false);
  error     = signal('');
  saved     = signal('');
  expanded  = signal<Set<string>>(new Set());

  // ── Filtres ───────────────────────────────────────────
  fChannel = signal<CommChannel | ''>('');
  fSource  = signal<'' | 'auto' | 'manual'>('');
  fFrom    = signal('');          // yyyy-MM-dd
  fTo      = signal('');

  // ── Formulaire (ajout / modification) ─────────────────
  form      = signal<CommForm | null>(null);
  /** Fichiers choisis pour une nouvelle entrée : envoyés une fois l'entrée créée. */
  formFiles = signal<File[]>([]);
  saving    = signal(false);
  formError = signal('');
  private _formSnapshot = '';
  /** Courriels connus de l'élément choisi (contacts actifs de la compagnie, ou employé) ; null = pas encore chargés. */
  knownEmails = signal<CommEmail[] | null>(null);
  /** Adresses mises d'office dans « À » : remplacées tant que l'utilisateur n'y a pas touché. */
  private _autoContact = '';

  // ── Appel depuis TimeGuard (téléphonie) ───────────────
  callPanel          = signal(false);
  callNumbers        = signal<CallNumber[]>([]);
  callNumbersLoading = signal(false);
  callOther          = signal('');
  callError          = signal('');
  /** Enregistrement en cours d'écoute (un seul à la fois). */
  playing     = signal<{ id: string; url: string } | null>(null);
  playLoading = signal<string | null>(null);
  private _reloadTimer: ReturnType<typeof setTimeout> | null = null;

  list = computed(() => this.tab() === 'company' ? this.companies() : this.employees());

  /** Éléments affichés : recherche par nom ; les désactivés sans historique sont masqués par défaut. */
  shownTargets = computed(() => {
    const q = this._norm(this.search()), all = this.showInactive();
    return this.list().filter(t => (all || t.isActive || t.count > 0) && (!q || this._norm(t.name).includes(q)));
  });

  hasFilters = computed(() => !!(this.fChannel() || this.fSource() || this.fFrom() || this.fTo()));

  shownItems = computed(() => {
    const ch = this.fChannel(), src = this.fSource(), from = this.fFrom(), to = this.fTo();
    return this.items().filter(i => {
      if (ch && i.channel !== ch) return false;
      if (src === 'auto' && !i.isAutomatic) return false;
      if (src === 'manual' && i.isAutomatic) return false;
      const day = this._localDay(i.occurredAt);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    });
  });

  constructor(private svc: CommunicationsService, private filesSvc: AttachmentsService) {
    // Un appel vient de se terminer pour l'élément affiché : son entrée (durée, issue) est rechargée,
    // après un court délai car Twilio transmet l'issue de l'appel juste après le raccrochage.
    effect(() => {
      const ended = this.tel.lastEnded();
      if (!ended || Date.now() - ended.at > 10_000) return;   // appel terminé avant l'ouverture de la page
      if (this._reloadTimer) clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => {
        const t = this.selected();
        if (t && t.id === ended.targetId && this.tab() === ended.targetType) this._refreshAfterCall(t.id);
      }, 2000);
    });
  }

  ngOnInit(): void { this.loadTargets(); this.tel.loadStatus(); }

  ngOnDestroy(): void {
    if (this._reloadTimer) clearTimeout(this._reloadTimer);
    this.stopListening();
  }

  loadTargets(): void {
    this.targetsLoading.set(true);
    this.targetsError.set('');
    this.svc.getTargets().subscribe({
      next: t => {
        this.companies.set(t.companies);
        this.employees.set(t.employees);
        this.canCompanies.set(t.canCompanies);
        this.canEmployees.set(t.canEmployees);
        if (!t.canCompanies && t.canEmployees && !this.selected()) this.tab.set('employee');
        this.targetsLoading.set(false);
      },
      error: err => {
        this.targetsError.set(httpErrorMessage(err, `Impossible de charger la liste`));
        this.targetsLoading.set(false);
      },
    });
  }

  async setTab(tab: CommTargetType): Promise<void> {
    if (this.tab() === tab || !await this._canLeaveForm()) return;
    this.tab.set(tab);
    this.search.set('');
    this.selected.set(null);
    this.items.set([]);
    this.form.set(null);
    this.knownEmails.set(null);
    this.error.set('');
    this.closeCall();
    this.stopListening();
  }

  async select(t: CommTarget): Promise<void> {
    if (this.selected()?.id === t.id || !await this._canLeaveForm()) return;
    this.selected.set(t);
    this.form.set(null);
    this.knownEmails.set(null);
    this.expanded.set(new Set());
    this.clearFilters();
    this.closeCall();
    this.stopListening();
    this._load();
  }

  selectById(id: string): void {
    const t = this.list().find(x => x.id === id);
    if (t) this.select(t);
  }

  private _load(): void {
    const t = this.selected();
    if (!t) return;
    const type = this.tab();
    this.loading.set(true);
    this.error.set('');
    this.items.set([]);
    this.svc.get(type, t.id).subscribe({
      next: list => {
        if (this.selected()?.id !== t.id) return;          // un autre élément a été choisi entre-temps
        this.items.set(list);
        this.loading.set(false);
      },
      error: err => {
        if (this.selected()?.id !== t.id) return;
        this.error.set(httpErrorMessage(err, `Impossible de charger l'historique`));
        this.loading.set(false);
      },
    });
  }

  reload(): void { this._load(); }

  clearFilters(): void {
    this.fChannel.set(''); this.fSource.set(''); this.fFrom.set(''); this.fTo.set('');
  }

  toggle(id: string): void {
    const s = new Set(this.expanded());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expanded.set(s);
  }
  isOpen(id: string): boolean { return this.expanded().has(id); }

  // ── Formulaire ────────────────────────────────────────
  async openNew(): Promise<void> {
    if (!await this._canLeaveForm()) return;
    this._openForm({ id: null, when: this._toLocalInput(new Date()), channel: 'call', direction: 'out', contact: '', subject: '', body: '', sendEmail: false });
  }

  async edit(i: Communication): Promise<void> {
    if (i.isAutomatic || !await this._canLeaveForm()) return;
    this._openForm({
      id: i.id, when: this._toLocalInput(new Date(i.occurredAt)), channel: i.channel, direction: i.direction,
      contact: i.contact ?? '', subject: i.subject, body: i.body ?? '', sendEmail: false,
    });
  }

  /** Nouveau courriel de sens « Envoyé » : il peut être expédié à l'enregistrement. */
  canSend(f: CommForm): boolean { return !f.id && f.channel === 'email' && f.direction === 'out'; }

  /** Type ou sens changé : un nouveau courriel reçoit d'office les adresses des contacts actifs. */
  setKind(change: { channel?: CommChannel; direction?: CommDirection }): void {
    this.patch(change);
    const f = this.form();
    if (!f || f.id) return;
    if (!this.canSend(f)) {
      // Les adresses mises d'office n'ont pas de sens pour un appel ou une rencontre
      this.patch({ sendEmail: false, contact: f.contact === this._autoContact ? '' : f.contact });
      this._autoContact = '';
      return;
    }
    const known = this.knownEmails();
    if (known) { this._fillRecipients(known); return; }
    const t = this.selected(), type = this.tab();
    if (!t) return;
    this.svc.getEmails(type, t.id).subscribe({
      next: list => {
        if (this.selected()?.id !== t.id) return;
        this.knownEmails.set(list);
        this._fillRecipients(list);
      },
      error: () => { /* le champ « À » reste à saisir à la main */ },
    });
  }

  private _fillRecipients(list: CommEmail[]): void {
    const f = this.form();
    if (!f || !this.canSend(f) || (f.contact.trim() && f.contact !== this._autoContact)) return;
    this._autoContact = [...new Set(list.map(e => e.email))].join('; ');
    this.patch({ contact: this._autoContact });
  }

  private _openForm(f: CommForm): void {
    this._formSnapshot = JSON.stringify(f);
    this._autoContact = '';
    this.formFiles.set([]);
    this.formError.set('');
    this.form.set(f);
  }

  patch(change: Partial<CommForm>): void {
    const f = this.form();
    if (f) this.form.set({ ...f, ...change });
  }

  formDirty(): boolean {
    const f = this.form();
    return !!f && (JSON.stringify(f) !== this._formSnapshot || this.formFiles().length > 0);
  }

  async cancelForm(): Promise<void> {
    if (!await this._canLeaveForm()) return;
    this.formFiles.set([]);
    this.form.set(null);
  }

  private async _canLeaveForm(): Promise<boolean> {
    if (this.saving()) return false;
    return !this.formDirty() || this.confirmDlg.discard('L\'entrée en cours de saisie sera perdue.');
  }

  save(): void {
    const f = this.form(), t = this.selected();
    if (!f || !t || this.saving()) return;
    if (!f.subject.trim()) { this.formError.set('Le sujet est obligatoire.'); return; }
    const when = new Date(f.when);
    if (!f.when || isNaN(when.getTime())) { this.formError.set('La date est obligatoire.'); return; }
    const sending = f.sendEmail && this.canSend(f);
    if (sending && !f.contact.trim()) { this.formError.set('Pour envoyer le courriel, saisissez au moins une adresse dans « À ».'); return; }
    if (sending && !f.body.trim())    { this.formError.set('Pour envoyer le courriel, écrivez le message.'); return; }

    const req: CommSave = {
      targetType: this.tab(), targetId: t.id, occurredAt: when.toISOString(),
      channel: f.channel, direction: f.direction, contact: f.contact.trim(), subject: f.subject.trim(), body: f.body.trim(),
    };
    this.saving.set(true);
    this.formError.set('');
    (f.id ? this.svc.update(f.id, req) : this.svc.add(req)).subscribe({
      next: item => {
        // L'entrée existe : ses pièces jointes sont envoyées avant de fermer le formulaire
        this.filesSvc.uploadAll('communication', item.id, f.id ? [] : this.formFiles()).subscribe(up => {
          const saved = { ...item, attachments: [...(item.attachments ?? []), ...up.uploaded] };
          this._putItem(saved);
          if (!f.id) this._bumpCount(t.id, 1, saved.occurredAt);
          this.formFiles.set([]);
          this.form.set(null);
          if (up.errors.length) {
            // Un courriel ne part pas sans une pièce jointe que l'utilisateur voulait y mettre
            this.saving.set(false);
            this.error.set(`Entrée ajoutée, mais ${up.errors.length} pièce(s) jointe(s) refusée(s) — ${up.errors.join(' ; ')}`
              + (sending ? ' Le courriel n\'a pas été envoyé : corrigez les pièces jointes, puis cliquez sur « Envoyer ce courriel » dans l\'entrée.' : ''));
            this._toast('Entrée ajoutée');
          } else if (sending) {
            this._send(saved);
          } else {
            this.saving.set(false);
            this.error.set('');
            this._toast(f.id ? 'Entrée modifiée' : 'Entrée ajoutée');
          }
        });
      },
      error: err => {
        this.formError.set(httpErrorMessage(err, `Enregistrement impossible`));
        this.saving.set(false);
      },
    });
  }

  /** Courriel saisi, pas encore envoyé : il peut l'être depuis l'historique (ou réessayé après un échec). */
  sendable(i: Communication): boolean { return !i.isAutomatic && i.channel === 'email' && i.direction === 'out'; }

  async sendNow(i: Communication): Promise<void> {
    if (this.saving() || !this.sendable(i)) return;
    const files = i.attachments?.length ?? 0;
    if (!await this.confirmDlg.ask({
      title: `Envoyer le courriel « ${i.subject} » ?`,
      message: `À : ${i.contact || '(aucun destinataire)'}` + (files ? ` — ${files} pièce(s) jointe(s)` : '') + '. Une fois envoyé, il ne se modifie plus.',
      confirmLabel: 'Envoyer',
    })) return;
    this.saving.set(true);
    this._send(i);
  }

  /** Envoie le courriel d'une entrée enregistrée (`saving` est déjà vrai). */
  private _send(i: Communication): void {
    this.svc.send(i.id).subscribe({
      next: sent => {
        this._putItem(sent);
        this.saving.set(false);
        this.error.set(sent.error ? `Le courriel n'a pas pu être envoyé : ${sent.error} L'entrée est enregistrée ; cliquez sur « Envoyer ce courriel » pour réessayer.` : '');
        this._toast(sent.error ? 'Entrée enregistrée, courriel non envoyé' : 'Courriel envoyé');
      },
      error: err => {
        this.saving.set(false);
        this.error.set(httpErrorMessage(err, `Le courriel n'a pas été envoyé`) + ' L\'entrée est enregistrée : corrigez-la, puis cliquez sur « Envoyer ce courriel ».');
      },
    });
  }

  /** Ajoute ou remplace une entrée de l'historique, la plus récente en premier. */
  private _putItem(item: Communication): void {
    const rest = this.items().filter(i => i.id !== item.id);
    this.items.set([...rest, item].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
  }

  async remove(i: Communication): Promise<void> {
    const t = this.selected();
    if (!t || i.isAutomatic || this.saving()) return;
    const files = i.attachments?.length ?? 0;
    if (!await this.confirmDlg.danger(`Supprimer l'entrée « ${i.subject} » ?`,
      files === 1 ? 'Sa pièce jointe sera supprimée aussi. Cette action est définitive.'
        : files ? `Ses ${files} pièces jointes seront supprimées aussi. Cette action est définitive.` : 'Cette action est définitive.')) return;
    this.saving.set(true);
    this.svc.delete(i.id).subscribe({
      next: () => {
        this.items.set(this.items().filter(x => x.id !== i.id));
        if (this.form()?.id === i.id) this.form.set(null);
        this._bumpCount(t.id, -1, null);
        this.saving.set(false);
        this._toast('Entrée supprimée');
      },
      error: err => {
        this.error.set(httpErrorMessage(err, `Suppression impossible`));
        this.saving.set(false);
      },
    });
  }

  // ── Appel depuis TimeGuard ────────────────────────────
  /** Ouvre le choix du numéro : numéros connus de l'élément, ou un autre numéro saisi. */
  openCall(): void {
    const t = this.selected();
    if (!t) return;
    this.callPanel.set(true);
    this.callError.set('');
    this.callOther.set('');
    this.callNumbers.set([]);
    this.callNumbersLoading.set(true);
    this.tel.getNumbers(this.tab(), t.id).subscribe({
      next: list => {
        if (this.selected()?.id !== t.id) return;
        this.callNumbers.set(list);
        this.callNumbersLoading.set(false);
      },
      error: err => {
        if (this.selected()?.id !== t.id) return;
        this.callError.set(httpErrorMessage(err, `Impossible de charger les numéros`));
        this.callNumbersLoading.set(false);
      },
    });
  }

  closeCall(): void { this.callPanel.set(false); this.callError.set(''); }

  async dial(number: string, contact: string): Promise<void> {
    const t = this.selected();
    if (!t || !number.trim()) { this.callError.set('Saisissez un numéro.'); return; }
    this.callError.set('');
    const error = await this.tel.start(this.tab(), t.id, number.trim(), contact || t.name);
    if (error) this.callError.set(error);
    else this.closeCall();
  }

  callBusy(): boolean {
    const c = this.tel.call();
    return !!c && c.state !== 'ended';
  }

  /** Recharge l'historique sans l'effacer de l'écran (l'entrée de l'appel reçoit sa durée et son issue). */
  private _refreshAfterCall(targetId: string): void {
    const before = this.items().length;
    this.svc.get(this.tab(), targetId).subscribe({
      next: list => {
        if (this.selected()?.id !== targetId) return;
        this.items.set(list);
        if (list.length > before) this._bumpCount(targetId, list.length - before, list[0]?.occurredAt ?? null);
      },
      error: () => { /* l'historique affiché reste valable ; « Réessayer » n'est pas nécessaire ici */ },
    });
  }

  /** Durée et issue d'un appel passé depuis TimeGuard. */
  callSummary(i: Communication): string {
    const status = this.CALL_STATUS[i.callStatus ?? ''] ?? '';
    const d = i.durationSeconds ?? 0;
    const duration = d > 0 ? `${Math.floor(d / 60)} min ${String(d % 60).padStart(2, '0')} s` : '';
    return [status, duration].filter(Boolean).join(' · ');
  }

  listen(i: Communication): void {
    if (this.playLoading()) return;
    this.stopListening();
    this.playLoading.set(i.id);
    this.tel.getRecording(i.id).subscribe({
      next: blob => {
        this.playing.set({ id: i.id, url: URL.createObjectURL(blob) });
        this.playLoading.set(null);
      },
      error: err => {
        this.error.set(httpErrorMessage(err, `Écoute impossible`));
        this.playLoading.set(null);
      },
    });
  }

  stopListening(): void {
    const p = this.playing();
    if (p) URL.revokeObjectURL(p.url);
    this.playing.set(null);
  }

  setAttachments(i: Communication, attachments: AttachmentItem[]): void {
    this.items.set(this.items().map(x => x.id === i.id ? { ...x, attachments } : x));
  }

  /** Met à jour le compteur de la liste de gauche sans tout recharger. */
  private _bumpCount(id: string, delta: number, at: string | null): void {
    const update = (l: CommTarget[]) => l.map(t => t.id !== id ? t
      : { ...t, count: Math.max(0, t.count + delta), lastAt: at && (!t.lastAt || at > t.lastAt) ? at : t.lastAt });
    if (this.tab() === 'company') this.companies.set(update(this.companies()));
    else this.employees.set(update(this.employees()));
    const sel = this.selected();
    if (sel?.id === id) this.selected.set(this.list().find(t => t.id === id) ?? sel);
  }

  private _toastTimer: ReturnType<typeof setTimeout> | null = null;
  private _toast(msg: string): void {
    this.saved.set(msg);
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.saved.set(''), 3000);
  }

  /** Onglet fermé / page rechargée avec une entrée non enregistrée : le navigateur demande confirmation. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (this.formDirty()) { ev.preventDefault(); ev.returnValue = ''; }
  }

  // ── Affichage ─────────────────────────────────────────
  channelLabel(c: string): string { return this.CHANNELS.find(x => x.key === c)?.label ?? c; }
  channelIcon(c: string): string  { return this.CHANNELS.find(x => x.key === c)?.icon ?? '•'; }
  contactLabel(i: { channel: string; direction: string }): string {
    if (i.channel === 'email') return i.direction === 'in' ? 'De' : 'À';
    return 'Interlocuteur';
  }
  initials(name: string): string {
    return (name ?? '').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('') || '?';
  }
  trackTarget(_: number, t: CommTarget): string { return t.id; }
  trackItem(_: number, i: Communication): string { return i.id; }

  /** Minuscules, sans accents ni espaces autour (« Hotel » trouve « Hôtel »). */
  private _norm(s: string): string {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  /** Jour local (yyyy-MM-dd) d'une date ISO UTC, pour le filtre de période. */
  private _localDay(iso: string): string {
    return this._toLocalInput(new Date(iso)).slice(0, 10);
  }

  /** Date → valeur d'un champ datetime-local (yyyy-MM-ddTHH:mm, heure locale). */
  private _toLocalInput(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}
