import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountsService, LinkedAccount } from '../../../state/accounts/accounts.service';
import { AuthService } from '../../../state/auth/auth.service';
import { ConfirmService } from '../../../state/ui/confirm.service';
import { httpErrorMessage } from '../../shared/http-error';

/**
 * « Mes entreprises » : relier ses comptes de plusieurs entreprises et basculer de l'une à l'autre.
 * Relier = saisir l'identifiant entreprise, le nom d'utilisateur et le mot de passe de l'autre compte (preuve
 * qu'il vous appartient). Dans chaque entreprise, vos droits restent ceux de votre compte de cette entreprise.
 */
@Component({
  selector: 'app-my-companies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './my-companies.component.html',
  styleUrls: ['./my-companies.component.scss'],
})
export class MyCompaniesComponent implements OnInit {
  readonly accounts = inject(AccountsService);
  readonly auth     = inject(AuthService);
  private readonly confirmDlg = inject(ConfirmService);

  tenantSlug = '';
  username   = '';
  password   = '';

  readonly linking  = signal(false);
  readonly busyId   = signal<number | null>(null);   // compte en cours de bascule ou de retrait
  readonly error    = signal('');
  readonly success  = signal('');

  ngOnInit(): void { this.accounts.load(); }

  link(): void {
    this.error.set(''); this.success.set('');
    const req = { tenantSlug: this.tenantSlug.trim(), username: this.username.trim(), password: this.password };
    if (!req.tenantSlug || !req.username || !req.password) { this.error.set('Remplissez les trois champs.'); return; }
    this.linking.set(true);
    this.accounts.link(req).subscribe({
      next: () => {
        this.linking.set(false);
        this.success.set(`Le compte « ${req.username} » de l'entreprise « ${req.tenantSlug} » est relié.`);
        this.tenantSlug = ''; this.username = ''; this.password = '';
      },
      error: err => { this.linking.set(false); this.password = ''; this.error.set(httpErrorMessage(err)); },
    });
  }

  switchTo(a: LinkedAccount): void {
    if (a.isCurrent || !a.available) return;
    this.error.set(''); this.busyId.set(a.credentialId);
    // En cas de réussite la page est rechargée sur l'accueil de l'autre entreprise
    this.accounts.switchTo(a.credentialId).subscribe({
      error: err => { this.busyId.set(null); this.error.set(httpErrorMessage(err)); },
    });
  }

  async unlink(a: LinkedAccount): Promise<void> {
    const self = a.isCurrent;
    const ok = await this.confirmDlg.ask({
      title: self ? 'Retirer ce compte des comptes reliés ?' : `Ne plus relier le compte de « ${a.tenantSlug} » ?`,
      message: self
        ? 'Vous ne pourrez plus basculer vers vos autres entreprises depuis ce compte. Les comptes eux-mêmes ne sont pas supprimés.'
        : 'Vous ne pourrez plus y basculer depuis ce compte. Le compte lui-même n\'est pas supprimé.',
      confirmLabel: 'Retirer le lien', danger: true,
    });
    if (!ok) return;
    this.error.set(''); this.success.set(''); this.busyId.set(a.credentialId);
    this.accounts.unlink(a.credentialId).subscribe({
      next:  () => this.busyId.set(null),
      error: err => { this.busyId.set(null); this.error.set(httpErrorMessage(err)); },
    });
  }

  /** Compte dont le mot de passe a changé : formulaire prérempli, il ne reste qu'à saisir le nouveau mot de passe. */
  prefill(a: LinkedAccount): void {
    this.tenantSlug = a.tenantSlug; this.username = a.username; this.password = '';
    this.error.set(''); this.success.set('');
    setTimeout(() => document.getElementById('mc-pwd')?.focus());
  }

  trackAccount(_: number, a: LinkedAccount): number { return a.credentialId; }
}
