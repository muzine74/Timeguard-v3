import { Component, HostListener, signal, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CompanyService, ContactRequest } from  '../../../state/compagny/Company.service';
import { CompanyForm, FreqOption, SemainePlanning, JourMensuel } from '../../../models';

@Component({
    selector: 'app-company-form',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './company-form.component.html',
    styleUrls: ['./company-form.component.scss']
})
export class CompanyFormComponent {
  saved  = signal(false);
  error  = signal('');

  // Délègue au service
  saving = this.companySvc.saving;

  freqOptions: FreqOption[] = [
    { value: 'hebdomadaire',   label: 'Hebdomadaire' },
    { value: 'biHebdomadaire', label: 'Bi-hebdomadaire' },
    { value: 'biMensuel',      label: 'Bi-mensuel' },
    { value: 'mensuel',        label: 'Mensuel' },
  ];
  jours       = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const;
  joursLabels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[CompanyForm]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[CompanyForm]', ...a); }

  form: CompanyForm = {
    // Active par défaut (comme l'API) : une compagnie créée inactive n'apparaissait ni dans la liste (filtre « Actif ») ni au pointage
    companyName: '', companyCode: '', isActive: true, note: '',
    civicNumber: '', suite: '', city: '', state: 'QC', country: 'Canada',
    zipCode: '', addressNote: '',
    tps: '', tvq: '',
    frequencePaiement: 'hebdomadaire',
    frequenceTravail:  'hebdomadaire',
    semaine1:        this._emptySemaine(),
    semaine2:        this._emptySemaine(),
    joursBiMensuel:  this._makeJours(15),
    joursMensuel:    [],
    debutSemaine1:   null,
    modeFacturation: 'Visite',
    tauxHoraireClient:  null,
    tauxHoraireEmploye: null,
  };

  contact: ContactRequest = { name: '', isActive: true };

  get modeHebdo():     boolean { return this.form.frequenceTravail === 'hebdomadaire'; }
  get modeBiHebdo():   boolean { return this.form.frequenceTravail === 'biHebdomadaire'; }
  get modeBiMensuel(): boolean { return this.form.frequenceTravail === 'biMensuel'; }
  get modeMensuel():   boolean { return this.form.frequenceTravail === 'mensuel'; }

  constructor(private companySvc: CompanyService, private router: Router) {}

  private _emptySemaine(): SemainePlanning {
    const j = () => ({ actif: false, compagnie: 0, employe: 0 });
    return { lundi:j(), mardi:j(), mercredi:j(), jeudi:j(), vendredi:j(), samedi:j(), dimanche:j() };
  }

  private _makeJours(count: number): JourMensuel[] {
    return Array.from({ length: count }, (_, i) => ({
      jour: i + 1, actif: false, compagnie: 0, employe: 0
    }));
  }

  getJour(semaine: SemainePlanning, jour: string) { return (semaine as any)[jour]; }

  onFreqTravailChange(): void {
    this.log(`frequenceTravail → ${this.form.frequenceTravail}`);
    this.form.semaine1       = this._emptySemaine();
    this.form.semaine2       = this._emptySemaine();
    this.form.joursBiMensuel = this._makeJours(15);
    this.form.joursMensuel   = [];
    this.jourSelectionne     = 1;
  }

  // ── Soumission ────────────────────────────────────────
  /** Message affiché sous les taux tant qu'ils sont incomplets (mode « Heure »). */
  get hourlyRatesError(): string | null { return CompanyService.hourlyRatesError(this.form); }

  submit(): void {
    // Déjà en cours ou déjà créée (redirection en attente) : un 2e clic créerait un doublon
    if (this.saving() || this.saved()) return;
    if (!this.form.companyName.trim()) {
      this.error.set('Le nom de la compagnie est requis.');
      return;
    }
    const ratesError = CompanyService.hourlyRatesError(this.form);
    if (ratesError) { this.error.set(ratesError); return; }
    const mail = this.contact.mail?.trim();
    if (mail && !CompanyService.isEmail(mail)) { this.error.set('Le courriel du contact n’est pas valide (ex. nom@exemple.com).'); return; }
    if (!this.contact.name.trim() && (mail || this.contact.phone?.trim() || this.contact.notes?.trim())) {
      this.error.set('Indiquez le nom du contact (ou videz ses autres champs) : sans nom, le contact ne serait pas enregistré.');
      return;
    }

    this.log('submit() → CompanyService.create()');
    this.error.set('');
    this.companySvc.reset();

    this.companySvc.create(this.form).subscribe({
      next: () => {
        const companyId = this.companySvc.lastId();
        // Après création : la fiche de la compagnie (contacts, employés associés…)
        const openCompany = (delay: number) => setTimeout(() =>
          this.router.navigate(companyId ? ['/companies', companyId, 'edit'] : ['/companies/edit']), delay);
        this.saved.set(true);

        if (companyId && this.contact.name.trim()) {
          const contact: ContactRequest = {
            name:  this.contact.name.trim(),
            mail:  this.contact.mail?.trim() || undefined,
            phone: this.contact.phone?.trim() || undefined,
            notes: this.contact.notes?.trim() || undefined,
            isActive: true,
          };
          this.companySvc.addContact(companyId, contact).subscribe({
            next: () => openCompany(1500),
            error: e => {
              // Ne jamais masquer l'échec : la compagnie existe, le contact est à ressaisir sur sa fiche
              this.warn('Contact non sauvegardé:', e);
              this.error.set(`Compagnie créée, mais le contact n'a pas été enregistré (${e?.error?.message ?? 'erreur ' + e?.status}). Ajoutez-le depuis la fiche.`);
              openCompany(4000);
            },
          });
        } else {
          openCompany(1500);
        }
      },
      error: err => {
        const msg = err?.error?.message ?? this.companySvc.error() ?? `Erreur ${err.status}`;
        this.warn('✕ submit() échoué:', msg);
        this.error.set(msg);
      }
    });
  }

  // ── Mensuel — stepper ─────────────────────────────────
  jourSelectionne = 1;

  stepJour(delta: number): void {
    this.jourSelectionne = Math.max(1, Math.min(31, this.jourSelectionne + delta));
  }

  addJourMensuel(): void {
    const used = new Set(this.form.joursMensuel.map(j => j.jour));
    const next = Array.from({length:31},(_,i)=>i+1).find(n => !used.has(n)) ?? 1;
    this.form.joursMensuel.push({ jour: next, actif: true, compagnie: 0, employe: 0 });
    this.form.joursMensuel.sort((a, b) => a.jour - b.jour);
    this.log(`jour ${next} ajouté`);
  }

  stepJourLigne(index: number, delta: number): void {
    const j    = this.form.joursMensuel[index];
    const next = Math.max(1, Math.min(31, j.jour + delta));
    const used = new Set(this.form.joursMensuel.map((x, i) => i !== index ? x.jour : null));
    if (!used.has(next)) j.jour = next;
  }

  removeJourMensuel(index: number): void {
    this.form.joursMensuel.splice(index, 1);
    this.log(`ligne ${index} supprimée`);
  }

  /** Annuler : retour à la liste des compagnies (avec confirmation si une saisie serait perdue). */
  cancel(): void {
    if (this.isDirty() && !confirm('Abandonner la création ? Les informations saisies seront perdues.')) return;
    this._initial = '';
    this.router.navigate(['/companies/edit']);
  }

  /** Formulaire vide de départ : sert à savoir si quelque chose a été saisi. */
  private _initial = JSON.stringify([this.form, this.contact]);

  isDirty(): boolean {
    return !!this._initial && !this.saved() && JSON.stringify([this.form, this.contact]) !== this._initial;
  }

  /** Onglet fermé / page rechargée avec une saisie en cours : le navigateur demande confirmation. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (this.isDirty()) { ev.preventDefault(); ev.returnValue = ''; }
  }
}