import { Component, signal, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CompanyForm, FrequencePaiement, FrequenceTravail, SemainePlanning, JourMensuel } from '../../../models';

@Component({
  selector: 'app-company-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-form.component.html',
  styleUrls: ['./company-form.component.scss'],
})
export class CompanyFormComponent {
  saving = signal(false);
  saved  = signal(false);
  error  = signal('');

  freqPaiementOptions: FrequencePaiement[] = ['Hebdomadaire','Bi-hebdomadaire','Bi-mensuel','Mensuel'];
  freqTravailOptions:  FrequenceTravail[]  = ['Hebdomadaire','Bi-hebdomadaire','Bi-mensuel','Mensuel'];
  jours       = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const;
  joursLabels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[]) { if (this._dev) console.log('[CompanyForm]', ...a); }

  form: CompanyForm = {
    companyName: '', companyCode: '', isActive: false, providerId: '', note: '',
    civicNumber: '', suite: '', city: '', state: 'QC', country: 'Canada',
    zipCode: '', addressNote: '',
    contactName: '', contactMail: '', contactPhone: '', contactNote: '',
    tps: '', tvq: '',
    frequencePaiement: 'Hebdomadaire',
    frequenceTravail:  'Hebdomadaire',
    semaine1: this._emptySemaine(),
    semaine2: this._emptySemaine(),
    joursBiMensuel: this._makeJours(15),
    joursMensuel:   this._makeJours(31),
  };

  get modeHebdo():     boolean { return this.form.frequenceTravail === 'Hebdomadaire'; }
  get modeBiHebdo():   boolean { return this.form.frequenceTravail === 'Bi-hebdomadaire'; }
  get modeBiMensuel(): boolean { return this.form.frequenceTravail === 'Bi-mensuel'; }
  get modeMensuel():   boolean { return this.form.frequenceTravail === 'Mensuel'; }

  constructor(private http: HttpClient, private router: Router) {}

  private _emptySemaine(): SemainePlanning {
    const j = () => ({ actif: false, compagnie: '', employe: '' });
    return { lundi:j(), mardi:j(), mercredi:j(), jeudi:j(), vendredi:j(), samedi:j(), dimanche:j() };
  }

  private _makeJours(count: number): JourMensuel[] {
    return Array.from({ length: count }, (_, i) => ({
      jour: i + 1, actif: false, compagnie: '', employe: ''
    }));
  }

  getJour(semaine: SemainePlanning, jour: string) { return (semaine as any)[jour]; }

  onFreqTravailChange(): void {
    this.log(`frequenceTravail → ${this.form.frequenceTravail}`);
    this.form.semaine1      = this._emptySemaine();
    this.form.semaine2      = this._emptySemaine();
    this.form.joursBiMensuel = this._makeJours(15);
    this.form.joursMensuel   = this._makeJours(31);
  }

  submit(): void {
    if (!this.form.companyName.trim()) { this.error.set('Le nom de la compagnie est requis.'); return; }
    this.log('submit()', this.form);
    this.saving.set(true); this.error.set('');
    this.http.post('/api/company', this.form).subscribe({
      next:  () => { this.saving.set(false); this.saved.set(true); setTimeout(() => this.router.navigate(['/employees']), 1500); },
      error: err => { this.saving.set(false); this.error.set(`Erreur ${err.status}`); }
    });
  }

  // ── Mensuel — stepper ───────────────────────────────
  jourSelectionne = 1;
  newJourActif    = true;
  tarifCompagnie  = '';
  tarifEmploye    = '';

  stepJour(delta: number): void {
    this.jourSelectionne = Math.max(1, Math.min(31, this.jourSelectionne + delta));
  }



  cancel(): void { this.router.navigate(['/employees']); }
}