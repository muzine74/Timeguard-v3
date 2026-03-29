import { Component, signal, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CompanyService } from  '../../../state/compagny/Company.service';
import { CompanyForm, FrequencePaiement, FrequenceTravail, SemainePlanning, JourMensuel } from '../../../models';




@Component({
  selector: 'app-company-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-form.component.html',
  styleUrls: ['./company-form.component.scss'],
})
export class CompanyFormComponent {
  saved  = signal(false);
  error  = signal('');

  // Délègue au service
  saving = this.companySvc.saving;

  freqPaiementOptions: FrequencePaiement[] = ['Hebdomadaire','Bi-hebdomadaire','Bi-mensuel','Mensuel'];
  freqTravailOptions:  FrequenceTravail[]  = ['Hebdomadaire','Bi-hebdomadaire','Bi-mensuel','Mensuel'];
  jours       = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const;
  joursLabels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[CompanyForm]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[CompanyForm]', ...a); }

  form: CompanyForm = {
    companyName: '', companyCode: '', isActive: false, providerId: '', note: '',
    civicNumber: '', suite: '', city: '', state: 'QC', country: 'Canada',
    zipCode: '', addressNote: '',
    contactName: '', contactMail: '', contactPhone: '', contactNote: '',
    tps: '', tvq: '',
    frequencePaiement: 'Hebdomadaire',
    frequenceTravail:  'Hebdomadaire',
    semaine1:        this._emptySemaine(),
    semaine2:        this._emptySemaine(),
    joursBiMensuel:  this._makeJours(15),
    joursMensuel:    [],
  };

  get modeHebdo():     boolean { return this.form.frequenceTravail === 'Hebdomadaire'; }
  get modeBiHebdo():   boolean { return this.form.frequenceTravail === 'Bi-hebdomadaire'; }
  get modeBiMensuel(): boolean { return this.form.frequenceTravail === 'Bi-mensuel'; }
  get modeMensuel():   boolean { return this.form.frequenceTravail === 'Mensuel'; }

  constructor(private companySvc: CompanyService, private router: Router) {}

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
        this.saved.set(true);
        this.log('✓ navigation vers /employees dans 1.5s');
        setTimeout(() => this.router.navigate(['/employees']), 1500);
      },
      error: err => {
        const msg = this.companySvc.error() ?? `Erreur ${err.status}`;
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
    this.form.joursMensuel.push({ jour: next, actif: true, compagnie: '', employe: '' });
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