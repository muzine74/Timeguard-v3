import { Component, signal, isDevMode, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CompanyService, ContactRequest } from  '../../../state/compagny/Company.service';
import { CompanyForm, FreqOption, SemainePlanning, JourMensuel } from '../../../models';

@Component({
  selector: 'app-company-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-form.component.html',
  styleUrls: ['./company-form.component.scss'],
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
    companyName: '', companyCode: '', isActive: false, note: '',
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
  submit(): void {
    if (!this.form.companyName.trim()) {
      this.error.set('Le nom de la compagnie est requis.');
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
          this.companySvc.addContact(companyId, this.contact).subscribe({
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

  cancel(): void { this.router.navigate(['/employees']); }
}