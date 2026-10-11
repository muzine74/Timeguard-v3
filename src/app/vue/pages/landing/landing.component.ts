import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { IconComponent } from '../../components/icon/icon.component';
import { LangSwitchComponent } from '../../components/lang-switch/lang-switch.component';

/** Page de présentation publique (/bienvenue) : ce que fait TimeGuard, avec un aperçu et l'accès à l'inscription. */
@Component({
    selector: 'app-landing',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, RouterLink, IconComponent, LangSwitchComponent],
    templateUrl: './landing.component.html',
    styleUrls: ['./landing.component.scss']
})
export class LandingComponent {
  readonly features = [
    { icon: 'clock',    title: 'Pointage simple',
      text: 'Chaque employé saisit ses journées par compagnie. Le responsable valide la semaine en un clic.' },
    { icon: 'file',     title: 'Factures en quelques minutes',
      text: 'Les factures se créent à partir des pointages validés, avec vos prix et vos taxes, et partent par courriel.' },
    { icon: 'card',     title: 'Paie des employés',
      text: 'Le montant dû par semaine est calculé pour vous. Vous suivez les versements et ce qui reste à transférer.' },
    { icon: 'chart',    title: 'Vos chiffres, sans tableur',
      text: 'Ce qui est facturé, payé et en attente, les charges du mois et le rapprochement avec le relevé bancaire.' },
    { icon: 'message',  title: 'Suivi des clients et des employés',
      text: 'Notes, pièces jointes et historique de communication : tout ce qui a été dit et envoyé reste au même endroit.' },
    { icon: 'shield',   title: 'Chacun voit ce qui le concerne',
      text: 'Les accès se règlent par groupes et permissions. Les données de votre entreprise restent séparées des autres.' },
  ];

  readonly steps = [
    { n: 1, title: 'Créez votre espace', text: 'Le nom de votre entreprise et un compte administrateur suffisent. Votre espace est activé après validation.' },
    { n: 2, title: 'Ajoutez vos compagnies et vos employés', text: 'Un parcours « Premiers pas » vous guide sur la page d\'accueil.' },
    { n: 3, title: 'Pointez, facturez, payez', text: 'Le tableau de bord vous montre chaque jour ce qui demande votre attention.' },
  ];

  constructor(public auth: AuthService) {}
}
