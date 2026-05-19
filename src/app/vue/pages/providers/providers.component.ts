import { Component, OnInit, signal, computed, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TenantService, TenantSummary, TenantDetail } from '../../../state/tenant/tenant.service';
import { AuthService } from '../../../state/auth/auth.service';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-providers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './providers.component.html',
  styleUrls: ['./providers.component.scss'],
})
export class ProvidersComponent implements OnInit {

  // ── Sidebar ──────────────────────────────────────────────────────────────
  search       = '';
  statusFilter = signal<StatusFilter>('all');
  selected     = signal<TenantDetail | null>(null);
  loadingDetail = signal(false);

  get filteredTenants(): TenantSummary[] {
    const q   = this.search.toLowerCase();
    const sf  = this.statusFilter();
    return this.tenantSvc.list().filter(t => {
      const matchStatus = sf === 'all' || (sf === 'active' ? t.isActive : !t.isActive);
      const matchSearch = !q || t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }

  // ── Formulaire nouveau provider ───────────────────────────────────────────
  showNewForm   = signal(false);
  savingNew     = signal(false);
  newForm = {
    companyName: '', slug: '', ownerEmail: '',
    adminUsername: '', adminPassword: '', plan: 'starter',
  };
  newError = signal('');

  // ── Formulaire nouvel admin ───────────────────────────────────────────────
  showAdminForm = signal(false);
  savingAdmin   = signal(false);
  adminForm     = { employeeName: '', username: '', password: '' };
  adminError    = signal('');

  // ── Toast ────────────────────────────────────────────────────────────────
  toast        = signal('');
  toastVisible = signal(false);

  constructor(
    public tenantSvc: TenantService,
    public auth: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auth.restoreSession();
    this.tenantSvc.loadAll().subscribe(() => this.cdr.markForCheck());
  }

  openingId = signal<number | null>(null);

  openAsAdmin(credentialId: number): void {
    const s = this.selected();
    if (!s) return;
    this.openingId.set(credentialId);
    this.tenantSvc.impersonate(s.tenantId, credentialId).subscribe({
      next: res => {
        this.auth.impersonateAs(res);
        this.router.navigate(['/employees']);
      },
      error: () => {
        this.openingId.set(null);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Sélectionner un tenant ────────────────────────────────────────────────
  selectTenant(t: TenantSummary): void {
    if (this.selected()?.tenantId === t.tenantId) return;
    this.selected.set(null);
    this.showAdminForm.set(false);
    this.adminError.set('');
    this.loadingDetail.set(true);
    this.tenantSvc.getById(t.tenantId).subscribe({
      next: d => { this.selected.set(d); this.loadingDetail.set(false); this.cdr.markForCheck(); },
      error: () => { this.loadingDetail.set(false); this.cdr.markForCheck(); },
    });
  }

  // ── Générer slug depuis le nom ────────────────────────────────────────────
  onNameChange(): void {
    if (!this.newForm.slug)
      this.newForm.slug = this.newForm.companyName
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  // ── Créer un nouveau provider ─────────────────────────────────────────────
  submitNew(): void {
    const { companyName, slug, ownerEmail, adminUsername, adminPassword } = this.newForm;
    if (!companyName || !slug || !ownerEmail || !adminUsername || !adminPassword) {
      this.newError.set('Tous les champs sont obligatoires.'); return;
    }
    this.savingNew.set(true);
    this.newError.set('');
    this.tenantSvc.register(this.newForm).subscribe({
      next: () => {
        this.savingNew.set(false);
        this.showNewForm.set(false);
        this.newForm = { companyName: '', slug: '', ownerEmail: '', adminUsername: '', adminPassword: '', plan: 'starter' };
        this._toast('✅ Provider créé avec succès.');
        this.cdr.markForCheck();
      },
      error: err => {
        this.savingNew.set(false);
        this.newError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Créer un admin pour le tenant sélectionné ────────────────────────────
  submitAdmin(): void {
    const { employeeName, username, password } = this.adminForm;
    const tid = this.selected()?.tenantId;
    if (!tid || !employeeName || !username || !password) {
      this.adminError.set('Tous les champs sont obligatoires.'); return;
    }
    this.savingAdmin.set(true);
    this.adminError.set('');
    this.tenantSvc.createAdmin(tid, this.adminForm).subscribe({
      next: admin => {
        this.savingAdmin.set(false);
        this.showAdminForm.set(false);
        this.adminForm = { employeeName: '', username: '', password: '' };
        this.selected.update(d => d ? { ...d, admins: [...d.admins, admin] } : d);
        this._toast('✅ Administrateur créé.');
        this.cdr.markForCheck();
      },
      error: err => {
        this.savingAdmin.set(false);
        this.adminError.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.cdr.markForCheck();
      },
    });
  }

  // ── Supprimer un admin ────────────────────────────────────────────────────
  deleteAdmin(credentialId: number): void {
    const tid = this.selected()?.tenantId;
    if (!tid || !confirm('Supprimer cet administrateur ?')) return;
    this.tenantSvc.deleteAdmin(tid, credentialId).subscribe({
      next: () => {
        this.selected.update(d => d
          ? { ...d, admins: d.admins.filter(a => a.credentialId !== credentialId) }
          : d);
        this._toast('✅ Administrateur supprimé.');
        this.cdr.markForCheck();
      },
    });
  }

  // ── Activer / désactiver ──────────────────────────────────────────────────
  toggleActive(): void {
    const d = this.selected();
    if (!d) return;
    const next = !d.isActive;
    this.tenantSvc.setActive(d.tenantId, next).subscribe({
      next: () => {
        this.selected.update(t => t ? { ...t, isActive: next } : t);
        this._toast(next ? '✅ Provider activé.' : '⛔ Provider désactivé.');
        this.cdr.markForCheck();
      },
    });
  }

  setFilter(f: StatusFilter): void { this.statusFilter.set(f); }

  initials(name: string): string {
    const p = name.trim().split(/\s+/);
    return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
  }

  planLabel(plan: string): string {
    return { starter: 'Starter', pro: 'Pro', enterprise: 'Enterprise' }[plan] ?? plan;
  }

  private _toast(msg: string): void {
    this.toast.set(msg);
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 3000);
  }
}
