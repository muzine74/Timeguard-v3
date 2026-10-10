import { Component, OnInit, HostListener, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CommunicationsService, CommTarget, CommTargetType, CommChannel, CommDirection, Communication, CommSave,
} from '../../../state/communications/communications.service';

interface CommForm {
  id:        string | null;      // null = nouvelle entrée
  when:      string;             // valeur du champ datetime-local (heure locale)
  channel:   CommChannel;
  direction: CommDirection;
  contact:   string;
  subject:   string;
  body:      string;
}

/** Historique de communication par compagnie et par employé : courriels envoyés par TimeGuard
 *  (enregistrés automatiquement, en lecture seule) et entrées saisies à la main. */
@Component({
    selector: 'app-communications',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './communications.component.html',
    styleUrls: ['./communications.component.scss']
})
export class CommunicationsComponent implements OnInit {

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
  saving    = signal(false);
  formError = signal('');
  private _formSnapshot = '';

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

  constructor(private svc: CommunicationsService) {}

  ngOnInit(): void { this.loadTargets(); }

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
        this.targetsError.set(err?.error?.message ?? `Impossible de charger la liste (HTTP ${err?.status ?? '?'}).`);
        this.targetsLoading.set(false);
      },
    });
  }

  setTab(tab: CommTargetType): void {
    if (this.tab() === tab || !this._canLeaveForm()) return;
    this.tab.set(tab);
    this.search.set('');
    this.selected.set(null);
    this.items.set([]);
    this.form.set(null);
    this.error.set('');
  }

  select(t: CommTarget): void {
    if (this.selected()?.id === t.id || !this._canLeaveForm()) return;
    this.selected.set(t);
    this.form.set(null);
    this.expanded.set(new Set());
    this.clearFilters();
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
        this.error.set(err?.error?.message ?? `Impossible de charger l'historique (HTTP ${err?.status ?? '?'}).`);
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
  openNew(): void {
    if (!this._canLeaveForm()) return;
    this._openForm({ id: null, when: this._toLocalInput(new Date()), channel: 'call', direction: 'out', contact: '', subject: '', body: '' });
  }

  edit(i: Communication): void {
    if (i.isAutomatic || !this._canLeaveForm()) return;
    this._openForm({
      id: i.id, when: this._toLocalInput(new Date(i.occurredAt)), channel: i.channel, direction: i.direction,
      contact: i.contact ?? '', subject: i.subject, body: i.body ?? '',
    });
  }

  private _openForm(f: CommForm): void {
    this._formSnapshot = JSON.stringify(f);
    this.formError.set('');
    this.form.set(f);
  }

  patch(change: Partial<CommForm>): void {
    const f = this.form();
    if (f) this.form.set({ ...f, ...change });
  }

  formDirty(): boolean {
    const f = this.form();
    return !!f && JSON.stringify(f) !== this._formSnapshot;
  }

  cancelForm(): void {
    if (!this._canLeaveForm()) return;
    this.form.set(null);
  }

  private _canLeaveForm(): boolean {
    if (this.saving()) return false;
    return !this.formDirty() || confirm('L\'entrée en cours de saisie n\'est pas enregistrée. Continuer ?');
  }

  save(): void {
    const f = this.form(), t = this.selected();
    if (!f || !t || this.saving()) return;
    if (!f.subject.trim()) { this.formError.set('Le sujet est obligatoire.'); return; }
    const when = new Date(f.when);
    if (!f.when || isNaN(when.getTime())) { this.formError.set('La date est obligatoire.'); return; }

    const req: CommSave = {
      targetType: this.tab(), targetId: t.id, occurredAt: when.toISOString(),
      channel: f.channel, direction: f.direction, contact: f.contact.trim(), subject: f.subject.trim(), body: f.body.trim(),
    };
    this.saving.set(true);
    this.formError.set('');
    (f.id ? this.svc.update(f.id, req) : this.svc.add(req)).subscribe({
      next: item => {
        const rest = this.items().filter(i => i.id !== item.id);
        this.items.set([...rest, item].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
        if (!f.id) this._bumpCount(t.id, 1, item.occurredAt);
        this.saving.set(false);
        this.form.set(null);
        this._toast(f.id ? 'Entrée modifiée' : 'Entrée ajoutée');
      },
      error: err => {
        this.formError.set(err?.error?.message ?? `Enregistrement impossible (HTTP ${err?.status ?? '?'}).`);
        this.saving.set(false);
      },
    });
  }

  remove(i: Communication): void {
    const t = this.selected();
    if (!t || i.isAutomatic || this.saving()) return;
    if (!confirm(`Supprimer l'entrée « ${i.subject} » ?`)) return;
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
        this.error.set(err?.error?.message ?? `Suppression impossible (HTTP ${err?.status ?? '?'}).`);
        this.saving.set(false);
      },
    });
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
