import { Component, ChangeDetectionStrategy, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';
import { DASHBOARD_PERMS } from '../../../state/auth/auth.guard';
import { PERM, PermKey } from '../../../state/auth/permissions';

/** Raccourci vers une page décrite par une section (mêmes libellés et mêmes permissions que la barre de menus). */
interface HelpLink { label: string; link: string; perms: readonly PermKey[]; }

/** Section du guide. `perms` : affichée si l'utilisateur a AU MOINS UNE de ces permissions (vide = tout le monde). */
interface HelpSection { id: string; title: string; perms: readonly PermKey[]; links?: readonly HelpLink[]; }

/** Texte comparable pour la recherche : minuscules, sans accents. */
const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Guide utilisateur. La page est ouverte à tous les utilisateurs connectés, mais chaque section ne s'affiche
 * que si l'utilisateur a la permission du menu qu'elle décrit (même règle que la barre de menus).
 * Ce n'est pas une protection des données : le texte du guide n'a rien de confidentiel, on évite seulement
 * de montrer à un employé des écrans auxquels il n'a pas accès.
 */
@Component({
    selector: 'app-help',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, RouterLink],
    templateUrl: './help.component.html',
    styleUrls: ['./help.component.scss']
})
export class HelpComponent {
  private readonly auth = inject(AuthService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  private static readonly ALL_SECTIONS: readonly HelpSection[] = [
    { id: 'premiers-pas',   title: 'Premiers pas',                              perms: [] },
    { id: 'accueil',        title: 'L’Accueil : ce qui demande votre attention', perms: DASHBOARD_PERMS as PermKey[], links: [
      { label: 'Accueil', link: '/accueil', perms: [] },
    ] },
    { id: 'pointage',       title: 'Pour les employés : saisir son pointage',   perms: [], links: [
      { label: 'Feuille de temps', link: '/pointage', perms: [PERM.pointageView] },
    ] },
    { id: 'employes',       title: 'Gérer les employés',                        perms: [PERM.employeesView, PERM.employeesCreate, PERM.employeesEdit], links: [
      { label: 'Nouvel employé',      link: '/employees/new',         perms: [PERM.employeesCreate] },
      { label: 'Modifier employé',    link: '/employees/edit',        perms: [PERM.employeesEdit] },
      { label: 'Tarifs employés',     link: '/employees/pricing',     perms: [PERM.employeesEdit] },
      { label: 'Assigner compagnies', link: '/companies/assign',      perms: [PERM.companiesEdit] },
      { label: 'Identifiants',        link: '/employees/credentials', perms: [PERM.credentialsManage] },
    ] },
    { id: 'compagnies',     title: 'Gérer les compagnies',                      perms: [PERM.companiesEdit], links: [
      { label: 'Liste compagnies',   link: '/companies/edit',   perms: [PERM.companiesEdit] },
      { label: 'Nouvelle compagnie', link: '/companies/new',    perms: [PERM.companiesEdit] },
      { label: 'Assigner employés',  link: '/employees/assign', perms: [PERM.employeesEdit] },
    ] },
    { id: 'combinaisons',   title: 'Employé et compagnie : les combinaisons',   perms: [PERM.companiesEdit, PERM.employeesEdit, PERM.pointageValidate] },
    { id: 'validation',     title: 'Valider le pointage',                       perms: [PERM.pointageValidate], links: [
      { label: 'Pointage employé', link: '/employees',            perms: [PERM.employeesView] },
      { label: 'Profil employé',   link: '/employees/validation', perms: [PERM.pointageValidate] },
    ] },
    { id: 'facturation',    title: 'Facturer vos compagnies',                   perms: [PERM.invoicesView, PERM.invoicesEdit, PERM.invoicesSend], links: [
      { label: 'Facturer par pointages',      link: '/invoices/from-timesheets', perms: [PERM.invoicesEdit] },
      { label: 'Nouvelle facture',            link: '/invoices/new',             perms: [PERM.invoicesEdit] },
      { label: 'Gérer les factures',          link: '/invoices',                 perms: [PERM.invoicesView] },
      { label: 'Envoyer les factures',        link: '/invoices/send',            perms: [PERM.invoicesSend] },
      { label: 'Téléchargement des factures', link: '/invoices/download',        perms: [PERM.invoicesView] },
      { label: 'Rapports',                    link: '/invoices/report',          perms: [PERM.invoicesView] },
      { label: 'Charges',                     link: '/charges',                  perms: [PERM.invoicesView] },
      { label: 'Relevé bancaire',             link: '/bank-statement',           perms: [PERM.paymentsManage] },
    ] },
    { id: 'paiements',      title: 'Payer vos employés',                        perms: [PERM.paymentsManage, PERM.employeesEdit], links: [
      { label: 'Paiements employés', link: '/employees/payments', perms: [PERM.paymentsManage] },
      { label: 'Feuillet T4A',       link: '/employees/t4a',      perms: [PERM.employeesEdit] },
    ] },
    { id: 'communications', title: 'Suivre les communications',                 perms: [PERM.companiesEdit, PERM.employeesEdit], links: [
      { label: 'Communications', link: '/communications', perms: [] },
    ] },
    { id: 'notes',          title: 'Notes et alertes',                          perms: [], links: [
      { label: 'Notes', link: '/notes', perms: [] },
    ] },
    { id: 'administration', title: 'Statistiques et administration',            perms: [PERM.statsView, PERM.groupsManage, PERM.configManage, PERM.credentialsManage, PERM.dataPurge], links: [
      { label: 'Statistiques',           link: '/stats',                 perms: [PERM.statsView] },
      { label: 'Groupes',                link: '/groups',                perms: [PERM.groupsManage] },
      { label: 'Identifiants',           link: '/employees/credentials', perms: [PERM.credentialsManage] },
      { label: 'Configuration',          link: '/config',                perms: [PERM.configManage] },
      { label: 'Suppression définitive', link: '/purge',                 perms: [PERM.dataPurge] },
    ] },
    { id: 'faq',            title: 'Questions fréquentes',                      perms: [] },
  ];

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Sommaire : surligne la section en cours de lecture (bande située sous la barre de navigation).
    afterNextRender(() => {
      const visible = new Set<string>();
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id);
        }
        const first = this.sections().find(s => visible.has(s.id));
        if (first) this._setActive(first.id);
      }, { rootMargin: '-120px 0px -60% 0px' });
      this.host.nativeElement.querySelectorAll('section[id]').forEach(el => io.observe(el));
      destroyRef.onDestroy(() => io.disconnect());
    });
  }

  /** Au moins une des permissions (le super utilisateur les a toutes ; liste vide = tout le monde). */
  can(...perms: PermKey[]): boolean {
    return perms.length === 0 || this.auth.isSuperUser() || perms.some(p => this.auth.hasPerm(p));
  }

  /** Sections que cet utilisateur voit (sommaire et contenu). */
  readonly sections = computed(() => HelpComponent.ALL_SECTIONS.filter(s => this.can(...s.perms)));
  private readonly _visibleIds = computed(() => new Set(this.sections().map(s => s.id)));
  show(id: string): boolean { return this._visibleIds().has(id); }

  /** L'utilisateur voit tout le guide (aucune section masquée). */
  readonly seesEverything = computed(() => this.sections().length === HelpComponent.ALL_SECTIONS.length);

  readonly P = PERM;

  /** Exemples « Employé et compagnie » — compagnie : planning lundi 80 $ / 40 $, 50 $/h client, 25 $/h employé ;
   *  pointage : lundi 08:00 → 11:30 (3,5 h). Mêmes montants que les tests automatisés (HourlyBillingTests). */
  readonly combos = [
    { n: 1, title: 'Compagnie à la visite · employé payé à la visite',
      employee: 'payé à la visite', entry: 'coche lundi', entryDetail: '1 visite (case cochée)',
      payCalc: 'Planning : 40,00 $', billCalc: 'Planning : 80,00 $',
      entryShort: 'case à cocher', payShort: 'prix du planning', billShort: 'prix du planning',
      steps: [
        { where: 'Gestion → Liste compagnies → la compagnie', what: 'carte Fréquences : Mode de facturation « Par visite (prix du planning) ». Dans le planning, cochez Lundi : prix compagnie 80, prix employé 40. Enregistrez.' },
        { where: 'Gestion → Modifier employé → l’employé', what: 'Mode de rémunération par défaut : « Par visite ». Sauvegardez.' },
        { where: 'Gestion → Assigner compagnies', what: 'affectez la compagnie à l’employé (s’il ne l’est pas déjà).' },
        { where: 'Mon travail → Feuille de temps (l’employé) ou Gestion → Profil employé (l’administrateur)', what: 'bloc « Compagnies par visite » : cochez le lundi. 40,00 $ s’affiche sous la case. Cliquez sur 💾 Sauvegarder.' },
        { where: 'Gestion → Profil employé → l’employé', what: 'cliquez sur ✅ Valider la semaine.' },
        { where: 'Finances → Facturer par pointages (mois du lundi)', what: 'la compagnie affiche 1× 80,00 $. Dans Finances → Paiements employés : 40,00 $.' },
      ],
      note: 'Le fonctionnement d’origine : l’employé coche ses visites, tout est calculé avec le planning.' },
    { n: 2, title: 'Compagnie à la visite · employé payé à l’heure',
      employee: 'payé à l’heure', entry: '08:00 → 11:30', entryDetail: '3,5 h saisies',
      payCalc: '3,5 h × 25 $ = 87,50 $', billCalc: '1 visite × 80 $ = 80,00 $',
      entryShort: 'début / fin', payShort: 'heures × taux employé', billShort: 'prix du planning (1 visite)',
      steps: [
        { where: 'Gestion → Liste compagnies → la compagnie', what: 'carte Fréquences : Mode de facturation « Par visite (prix du planning) » et Taux horaire employé par défaut : 25. Dans le planning, cochez Lundi : prix compagnie 80. Enregistrez.' },
        { where: 'Gestion → Modifier employé → l’employé', what: 'Mode de rémunération par défaut : « Par heure ». Sauvegardez. (Pour une seule compagnie : Gestion → Tarifs employés → l’employé → la compagnie → « Par heure ».)' },
        { where: 'Gestion → Assigner compagnies', what: 'affectez la compagnie à l’employé (s’il ne l’est pas déjà).' },
        { where: 'Mon travail → Feuille de temps ou Gestion → Profil employé', what: 'bloc « Compagnies à l’heure » : lundi, début 08:00, fin 11:30. « 3.5 h · 87.50 $ » s’affiche. Cliquez sur 💾 Sauvegarder.' },
        { where: 'Gestion → Profil employé → l’employé', what: 'cliquez sur ✅ Valider la semaine.' },
        { where: 'Finances → Facturer par pointages', what: 'la compagnie affiche 1× 80,00 $ (une visite). Dans Finances → Paiements employés : 87,50 $.' },
      ],
      note: 'Les heures servent à payer l’employé. Le client paie la visite du planning : une visite par jour, quel que soit le nombre d’heures.' },
    { n: 3, title: 'Compagnie à l’heure · employé payé à la visite',
      employee: 'payé à la visite', entry: '08:00 → 11:30', entryDetail: '3,5 h saisies',
      payCalc: 'Planning : 40,00 $ (1 visite)', billCalc: '3,5 h × 50 $ = 175,00 $',
      entryShort: 'début / fin', payShort: 'prix du planning (1 visite)', billShort: 'heures × taux client',
      steps: [
        { where: 'Gestion → Liste compagnies → la compagnie', what: 'carte Fréquences : Mode de facturation « Par heure » et Taux horaire client : 50. Dans le planning, cochez Lundi : prix employé 40 (paie à la visite). Enregistrez.' },
        { where: 'Gestion → Modifier employé → l’employé', what: 'Mode de rémunération par défaut : « Par visite ». Sauvegardez.' },
        { where: 'Gestion → Assigner compagnies', what: 'affectez la compagnie à l’employé (s’il ne l’est pas déjà).' },
        { where: 'Mon travail → Feuille de temps ou Gestion → Profil employé', what: 'bloc « Compagnies à l’heure » (la compagnie facture à l’heure) : lundi, début 08:00, fin 11:30. « 3.5 h » s’affiche. Cliquez sur 💾 Sauvegarder : la paie est fixée à 40,00 $ (une visite).' },
        { where: 'Gestion → Profil employé → l’employé', what: 'cliquez sur ✅ Valider la semaine.' },
        { where: 'Finances → Facturer par pointages', what: 'la compagnie affiche « 3.5 h × 50.00 $/h = 175.00 $ » et « Facturé à l’heure ». Dans Finances → Paiements employés : 40,00 $.' },
      ],
      note: 'Les heures servent à facturer le client. L’employé reçoit le prix de visite du planning pour la journée.' },
    { n: 4, title: 'Compagnie à l’heure · employé payé à l’heure',
      employee: 'payé à l’heure', entry: '08:00 → 11:30', entryDetail: '3,5 h saisies',
      payCalc: '3,5 h × 25 $ = 87,50 $', billCalc: '3,5 h × 50 $ = 175,00 $',
      entryShort: 'début / fin', payShort: 'heures × taux employé', billShort: 'heures × taux client',
      steps: [
        { where: 'Gestion → Liste compagnies → la compagnie', what: 'carte Fréquences : Mode de facturation « Par heure », Taux horaire client : 50, Taux horaire employé par défaut : 25. Enregistrez.' },
        { where: 'Gestion → Modifier employé → l’employé', what: 'Mode de rémunération par défaut : « Par heure ». Sauvegardez.' },
        { where: 'Gestion → Assigner compagnies', what: 'affectez la compagnie à l’employé (s’il ne l’est pas déjà).' },
        { where: 'Mon travail → Feuille de temps ou Gestion → Profil employé', what: 'bloc « Compagnies à l’heure » : lundi, début 08:00, fin 11:30. « 3.5 h · 87.50 $ » s’affiche. Cliquez sur 💾 Sauvegarder.' },
        { where: 'Gestion → Profil employé → l’employé', what: 'cliquez sur ✅ Valider la semaine.' },
        { where: 'Finances → Facturer par pointages', what: 'la compagnie affiche « 3.5 h × 50.00 $/h = 175.00 $ ». Dans Finances → Paiements employés : 87,50 $.' },
      ],
      note: 'Tout est calculé sur les heures : la paie avec le taux de l’employé, la facture avec le taux du client.' },
  ].map(c => ({ ...c, aria: `Cas ${c.n} — ${c.title}. Saisie : ${c.entry}. Paie : ${c.payCalc}. Facture : ${c.billCalc}.` }));

  /** Démarches des cas complémentaires (même exemple chiffré). */
  readonly extras = [
    { title: 'Taux spécifique de l’employé (30 $/h)', result: '105,00 $ de paie, facture inchangée', steps: [
        { where: 'Gestion → Tarifs employés → l’employé → la compagnie', what: 'Mode de rémunération chez cette compagnie : « Par heure » (ou « Par défaut » si l’employé est déjà payé à l’heure). Taux spécifique : 30. « Taux appliqué » indique 30.00 $/h. Cliquez sur Enregistrer.' },
        { where: 'Mon travail → Feuille de temps', what: 'lundi 08:00 → 11:30 : « 3.5 h · 105.00 $ ». Sauvegardez. Les pointages déjà enregistrés gardent leur ancien montant.' },
      ] },
    { title: 'Plusieurs plages dans la journée', result: '08:00 → 11:30 + 13:00 → 15:00 = 5,5 h', steps: [
        { where: 'Mon travail → Feuille de temps, bloc « Compagnies à l’heure »', what: 'dans la case du lundi, saisissez 08:00 → 11:30.' },
        { where: 'Même case', what: 'cliquez sur « + plage », puis saisissez 13:00 → 15:00. Le total du jour devient « 5.5 h » (137.50 $ à 25 $/h).' },
        { where: 'Même case', what: 'une plage en trop se retire avec ×. Des plages qui se chevauchent sont refusées à l’enregistrement. Cliquez sur 💾 Sauvegarder.' },
      ] },
    { title: 'Même semaine, deux compagnies payées différemment', result: 'A à la visite (40 $) + B à l’heure (87,50 $) = 127,50 $', steps: [
        { where: 'Gestion → Modifier employé → l’employé', what: 'Mode de rémunération par défaut : « Par visite ».' },
        { where: 'Gestion → Tarifs employés → l’employé → la compagnie B', what: 'Mode de rémunération chez cette compagnie : « Par heure ». Enregistrez.' },
        { where: 'Mon travail → Feuille de temps', what: 'bloc « Compagnies par visite » : cochez le lundi chez A. Bloc « Compagnies à l’heure » : lundi 08:00 → 11:30 chez B. Sauvegardez.' },
        { where: 'Mon travail → Feuille de temps, ▼ Détail par compagnie', what: 'A : 1 visite · 40,00 $ ; B : 3.5 h · 87,50 $ ; total 127,50 $.' },
      ] },
  ];

  /** Matrice 2 × 2 : lignes = rémunération de l’employé, colonnes = facturation de la compagnie. */
  readonly comboRows = [
    { label: 'à la visite', cells: [this.combos[0], this.combos[2]] },
    { label: 'à l’heure', cells: [this.combos[1], this.combos[3]] },
  ];

  /** Raccourcis de la section que cet utilisateur peut ouvrir. */
  linksOf(id: string): HelpLink[] {
    return (HelpComponent.ALL_SECTIONS.find(s => s.id === id)?.links ?? []).filter(l => this.can(...l.perms));
  }

  // ── Recherche dans le guide ──────────────────────────────────────────────
  readonly query = signal('');
  /** Sections dont le texte contient tous les mots cherchés (null = pas de recherche). */
  private readonly _hits = signal<Set<string> | null>(null);

  onSearch(value: string): void {
    this.query.set(value);
    const words = norm(value).split(/\s+/).filter(Boolean);
    if (!words.length) { this._hits.set(null); return; }
    const hits = new Set<string>();
    for (const s of this.sections()) {
      // Le texte est lu dans la page : une section masquée par la recherche précédente reste lisible.
      const text = norm(document.getElementById(s.id)?.textContent ?? '');
      if (words.every(w => text.includes(w))) hits.add(s.id);
    }
    this._hits.set(hits);
  }
  clearSearch(): void { this.onSearch(''); }

  readonly searching = computed(() => this._hits() !== null);
  hit(id: string): boolean { return this._hits()?.has(id) ?? true; }
  /** Sections du sommaire : toutes, ou seulement celles qui correspondent à la recherche. */
  readonly tocSections = computed(() => this.sections().filter(s => this.hit(s.id)));

  // ── Section en cours de lecture ──────────────────────────────────────────
  readonly active = signal('');
  /** Bouton « Haut de page » : dès qu'on a dépassé la première section. */
  readonly showTop = computed(() => !!this.active() && this.active() !== this.sections()[0]?.id);

  private _setActive(id: string): void {
    if (this.active() === id) return;
    this.active.set(id);
    // Sur mobile le sommaire est une bande horizontale : garder l'entrée active visible.
    const toc = this.host.nativeElement.querySelector<HTMLElement>('.toc');
    const link = toc?.querySelector<HTMLElement>(`a[data-id="${id}"]`);
    if (toc && link && toc.scrollWidth > toc.clientWidth) toc.scrollLeft = link.offsetLeft - 12;
  }

  /** Défilement vers une section (les ancres #id seraient interceptées par le routeur). */
  goTo(id: string, event: Event): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toTop(): void {
    this.host.nativeElement.querySelector('.help-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
