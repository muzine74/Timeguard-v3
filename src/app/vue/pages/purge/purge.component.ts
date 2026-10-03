import { Component, ChangeDetectionStrategy, signal, computed, inject, DestroyRef, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TenantService } from '../../../state/tenant/tenant.service';
import { AuthService } from '../../../state/auth/auth.service';
import { PurgeService, PurgeKind, PurgeCandidate, PurgePreview } from '../../../state/purge/purge.service';

const KINDS: { id: PurgeKind; label: string; placeholder: string }[] = [
  { id: 'bill',     label: 'Facture',   placeholder: 'N° de facture, compagnie ou période (ex. 2026-09)…' },
  { id: 'employee', label: 'Employé',   placeholder: 'Nom de l’employé…' },
  { id: 'company',  label: 'Compagnie', placeholder: 'Nom ou code de la compagnie…' },
];

/**
 * Suppression définitive (super utilisateur) : choisir l'entreprise, le type, l'élément ; un aperçu
 * liste toutes les références qui seront supprimées ; l'exécution exige de saisir « SUPPRIMER ».
 */
@Component({
  selector: 'app-purge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './purge.component.html',
  styleUrls: ['./purge.component.scss'],
})
export class PurgeComponent {
  readonly kinds = KINDS;
  private tenantSvc = inject(TenantService);
  private purgeSvc  = inject(PurgeService);
  private destroyRef = inject(DestroyRef);
  private host = inject(ElementRef<HTMLElement>);

  private auth = inject(AuthService);
  /** Super utilisateur : choisit l'entreprise. Admin d'entreprise : la sienne, imposée (et imposée aussi par l'API). */
  readonly isSuper = this.auth.isSuperUser();
  tenants   = this.tenantSvc.list;
  tenantId  = signal(this.isSuper ? '' : (this.auth.user()?.tenantId || '00000000-0000-0000-0000-000000000000'));
  kind      = signal<PurgeKind>('bill');
  query     = '';
  searching = signal(false);
  results   = signal<PurgeCandidate[]>([]);
  searched  = signal(false);

  preview      = signal<PurgePreview | null>(null);
  loadingPrev  = signal<string | null>(null);   // id en cours de chargement
  confirmText  = '';
  executing    = signal(false);
  error        = signal('');
  success      = signal('');
  private _opener: HTMLElement | null = null;

  placeholder = computed(() => KINDS.find(k => k.id === this.kind())?.placeholder ?? '');
  tenantName  = computed(() => this.isSuper
    ? (this.tenants().find(t => t.tenantId === this.tenantId())?.name ?? '')
    : 'votre entreprise');
  deleted     = computed(() => this.preview()?.items.filter(i => i.action === 'delete') ?? []);
  detached    = computed(() => this.preview()?.items.filter(i => i.action === 'detach') ?? []);
  files       = computed(() => this.preview()?.items.filter(i => i.action === 'file') ?? []);

  constructor() {
    if (this.isSuper) this.tenantSvc.loadAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
  }

  setKind(k: PurgeKind): void {
    this.kind.set(k);
    this.results.set([]);
    this.searched.set(false);
  }

  search(): void {
    if (!this.tenantId()) { this.error.set('Choisissez d’abord l’entreprise.'); return; }
    this.error.set('');
    this.searching.set(true);
    this.purgeSvc.search(this.tenantId(), this.kind(), this.query.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: list => { this.results.set(list); this.searched.set(true); this.searching.set(false); },
        error: e => { this.error.set(e?.error?.message ?? `Erreur HTTP ${e.status}`); this.searching.set(false); },
      });
  }

  openPreview(c: PurgeCandidate, ev: Event): void {
    this._opener = ev.currentTarget as HTMLElement;
    this.error.set('');
    this.loadingPrev.set(c.id);
    this.purgeSvc.preview(this.tenantId(), this.kind(), c.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: p => {
          this.loadingPrev.set(null);
          this.error.set('');
          this.confirmText = '';
          this.preview.set(p);
          setTimeout(() => (this.host.nativeElement.querySelector('.purge-dialog .confirm-input') as HTMLElement | null)?.focus());
        },
        error: e => { this.loadingPrev.set(null); this.error.set(e?.error?.message ?? `Erreur HTTP ${e.status}`); },
      });
  }

  closePreview(): void {
    if (this.executing()) return;
    this.preview.set(null);
    this._opener?.focus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.preview()) this.closePreview(); }

  canExecute(): boolean { return this.confirmText.trim() === 'SUPPRIMER' && !this.executing(); }

  execute(): void {
    const p = this.preview();
    if (!p || !this.canExecute()) return;
    this.executing.set(true);
    this.purgeSvc.execute(this.tenantId(), p.kind, p.id, 'SUPPRIMER')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => {
          this.executing.set(false);
          this.preview.set(null);
          this.results.update(list => list.filter(x => x.id !== p.id));
          this.success.set(`${p.title} supprimé(e) définitivement : ${r.recordsDeleted} enregistrement(s), `
            + `${r.recordsDetached} référence(s) retirée(s), ${r.filesDeleted} fichier(s)/dossier(s) effacé(s).`);
          // Fichiers non effacés : message persistant (à traiter), avec la référence du journal serveur
          if (r.warnings.length) this.error.set(`Attention : ${r.warnings.join(' ')}`);
          setTimeout(() => this.success.set(''), 8000);
        },
        error: e => {
          this.executing.set(false);
          this.error.set(e?.error?.message ?? `Échec de la suppression (HTTP ${e.status}). Rien n’a été supprimé en base.`);
        },
      });
  }

  trackById(_: number, c: PurgeCandidate) { return c.id; }
}
