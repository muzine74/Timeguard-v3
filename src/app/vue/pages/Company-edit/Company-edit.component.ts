import { Component, OnInit, HostListener, signal, computed, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { NoteAlertService } from '../../../state/notes/note-alert.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CompanyService, ContactItem, ContactRequest } from  '../../../state/compagny/Company.service';
import { EmployeesService } from '../../../state/employees/employees.service';
import { CompanyForm, FreqOption, SemainePlanning, JourMensuel } from '../../../models';

// Shape minimale pour la liste sidebar
export interface CompanySummary {
  companyId:   string;
  companyName: string;
  isActive:    boolean;
}

@Component({
    selector: 'app-company-edit',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './company-edit.component.html',
    styleUrls: ['./company-edit.component.scss']
})
export class CompanyEditComponent implements OnInit {
  private readonly noteAlerts = inject(NoteAlertService);
  saved       = signal(false);
  savedMsg    = signal('✓ Compagnie mise à jour');
  error       = signal('');
  loadingList = signal(true);
  listError   = signal('');
  loadingForm = signal(false);
  /** Formulaire tel que chargé (ou enregistré) : sert à détecter les modifications non enregistrées. */
  private _loaded = '';

  // ── Contacts ──────────────────────────────────────────
  contacts        = signal<ContactItem[]>([]);
  contactsLoading = signal(false);
  contactError    = signal('');
  showContactForm = signal(false);
  savingContact   = signal(false);
  editingContact  = signal<ContactItem | null>(null);
  contactForm: ContactRequest = { name: '', mail: '', phone: '', notes: '', isActive: true };

  saving      = this.companySvc.saving;
  empLoading  = this.empSvc.loading;
  companyId   = signal('');

  // Employés liés à la compagnie sélectionnée (calculé automatiquement)
  companyEmployees = computed(() => {
    const id = this.companyId();
    if (!id) return [];
    return this.empSvc.list().filter(e =>
      (e.employeeCompagnies ?? []).some((c: { compagnieId: string }) => c.compagnieId === id)
    );
  });

  companies    : CompanySummary[] = [];
  searchQuery  = '';
  statusFilter : 'all' | 'active' | 'inactive' = 'active';

  freqOptions: FreqOption[] = [
    { value: 'hebdomadaire',   label: 'Hebdomadaire' },
    { value: 'biHebdomadaire', label: 'Bi-hebdomadaire' },
    { value: 'biMensuel',      label: 'Bi-mensuel' },
    { value: 'mensuel',        label: 'Mensuel' },
  ];
  jours       = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'] as const;
  joursLabels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  private get _dev() { return isDevMode(); }
  private log(...a: unknown[])  { if (this._dev) console.log('[CompanyEdit]', ...a); }
  private warn(...a: unknown[]) { if (this._dev) console.warn('[CompanyEdit]', ...a); }

  form: CompanyForm = this._emptyForm();

  get modeHebdo():     boolean { return this.form.frequenceTravail === 'hebdomadaire'; }
  get modeBiHebdo():   boolean { return this.form.frequenceTravail === 'biHebdomadaire'; }
  get modeBiMensuel(): boolean { return this.form.frequenceTravail === 'biMensuel'; }
  get modeMensuel():   boolean { return this.form.frequenceTravail === 'mensuel'; }

  get filteredCompanies(): CompanySummary[] {
    let list = this.companies;
    if (this.statusFilter === 'active')   list = list.filter(c =>  c.isActive);
    if (this.statusFilter === 'inactive') list = list.filter(c => !c.isActive);
    const q = this._norm(this.searchQuery);
    return q ? list.filter(c => this._norm(c.companyName).includes(q)) : list;
  }

  /** Minuscules, sans accents ni espaces autour (« Hotel » trouve « Hôtel »). */
  private _norm(s: string): string {
    return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  trackCompany(_: number, c: CompanySummary): string { return c.companyId; }

  /** Le formulaire affiché diffère de ce qui est enregistré. */
  isDirty(): boolean {
    return !!this.companyId() && !this.loadingForm() && !!this._loaded && JSON.stringify(this.form) !== this._loaded;
  }

  /** Onglet fermé / page rechargée avec des modifications non enregistrées : le navigateur demande confirmation. */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (this.isDirty()) { ev.preventDefault(); ev.returnValue = ''; }
  }

  constructor(
    private companySvc: CompanyService,
    private empSvc:     EmployeesService,
    private router:     Router,
    private route:      ActivatedRoute,
    private cdr:        ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this._loadList();
    this.empSvc.loadList();
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.selectCompany(id);
  }

  // ── Contacts ──────────────────────────────────────────
  private _loadContacts(id: string): void {
    this.contactsLoading.set(true);
    this.contactError.set('');
    this.companySvc.getContacts(id).subscribe({
      next: list => {
        if (this.companyId() !== id) return;      // réponse d'une compagnie quittée entre-temps
        this.contacts.set(list);
        this.contactsLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        if (this.companyId() !== id) return;
        this.contacts.set([]);
        this.contactsLoading.set(false);
        this.contactError.set('Impossible de charger les contacts.');
      }
    });
  }

  openAddContact(): void {
    this.editingContact.set(null);
    this.contactForm = { name: '', mail: '', phone: '', notes: '', isActive: true };
    this.showContactForm.set(true);
    this.contactError.set('');
  }

  openEditContact(c: ContactItem): void {
    this.editingContact.set(c);
    this.contactForm = { name: c.name, mail: c.mail ?? '', phone: c.phone ?? '', notes: c.notes ?? '', isActive: c.isActive };
    this.showContactForm.set(true);
    this.contactError.set('');
  }

  cancelContactForm(): void {
    this.showContactForm.set(false);
    this.editingContact.set(null);
    this.contactError.set('');
  }

  saveContact(): void {
    if (this.savingContact()) return;
    if (!this.contactForm.name.trim()) { this.contactError.set('Le nom est requis.'); return; }
    const mail = this.contactForm.mail?.trim();
    if (mail && !CompanyService.isEmail(mail)) { this.contactError.set('Le courriel du contact n’est pas valide (ex. nom@exemple.com).'); return; }
    const id = this.companyId();
    if (!id) return;
    const editing = this.editingContact();
    this.contactError.set('');
    this.savingContact.set(true);

    const req: ContactRequest = {
      name:     this.contactForm.name.trim(),
      mail:     this.contactForm.mail?.trim() || undefined,
      phone:    this.contactForm.phone?.trim() || undefined,
      notes:    this.contactForm.notes?.trim() || undefined,
      isActive: this.contactForm.isActive,
    };

    if (editing) {
      this.companySvc.updateContact(id, editing.contactId, req).subscribe({
        next: () => {
          this.savingContact.set(false);
          this._loadContacts(id);
          this.showContactForm.set(false);
          this.editingContact.set(null);
        },
        error: err => { this.savingContact.set(false); this.contactError.set(err?.error?.message ?? 'Erreur lors de la modification.'); }
      });
    } else {
      this.companySvc.addContact(id, req).subscribe({
        next: () => {
          this.savingContact.set(false);
          this._loadContacts(id);
          this.showContactForm.set(false);
        },
        error: err => { this.savingContact.set(false); this.contactError.set(err?.error?.message ?? 'Erreur lors de l\'ajout.'); }
      });
    }
  }

  toggleContact(c: ContactItem): void {
    const id = this.companyId();
    if (!id) return;
    this.companySvc.toggleContact(id, c.contactId).subscribe({
      next: () => this._loadContacts(id),
      error: err => this.contactError.set(err?.error?.message ?? 'Erreur lors du changement de statut.')
    });
  }

  deleteContact(c: ContactItem): void {
    const id = this.companyId();
    if (!id) return;
    if (!confirm(`Supprimer le contact « ${c.name} » ? Il ne recevra plus les factures.`)) return;
    this.companySvc.deleteContact(id, c.contactId).subscribe({
      next: () => this._loadContacts(id),
      error: err => this.contactError.set(err?.error?.message ?? 'Erreur lors de la suppression.')
    });
  }

  // ── Charger la liste sidebar ──────────────────────────
  private _loadList(): void {
    this.loadingList.set(true);
    this.listError.set('');
    this.companySvc.getAll().subscribe({
      next: list => {
        this.companies = list;
        this.loadingList.set(false);
        this.log(`✓ ${list.length} compagnie(s) chargée(s)`);
      },
      error: err => {
        this.warn(`✕ getAll() échoué (${err.status})`);
        this.listError.set(err?.error?.message ?? `Impossible de charger les compagnies (HTTP ${err?.status ?? '?'}).`);
        this.loadingList.set(false);
      }
    });
  }

  reloadList(): void { this._loadList(); }

  // ── Sélectionner une compagnie → remplir le formulaire ─
  selectCompany(id: string): void {
    if (id === this.companyId()) return;
    if (this.isDirty() && !confirm(`Les modifications non enregistrées de « ${this.form.companyName || 'cette compagnie'} » seront perdues. Continuer ?`)) return;
    this._loaded = '';
    this.contacts.set([]);
    this.companyId.set(id);
    this.error.set('');
    this.saved.set(false);
    this.loadingForm.set(true);
    this.log(`selectCompany(${id})`);
    this.noteAlerts.check({ companyIds: [id] }, 'Modification de la compagnie');

    this.companySvc.getById(id).subscribe({
      next: data => {
        if (this.companyId() !== id) return;      // une autre compagnie a été choisie entre-temps : ne pas mélanger les fiches
        this.form = this._normalize(data);
        this._loaded = JSON.stringify(this.form);
        this.loadingForm.set(false);
        this.showContactForm.set(false);
        this.editingContact.set(null);
        this.cdr.markForCheck();
        this.log('✓ formulaire rempli:', data.companyName);
      },
      error: err => {
        if (this.companyId() !== id) return;
        this.warn(`✕ getById(${id}) échoué (${err.status})`);
        this.error.set(err?.error?.message ?? `Impossible de charger la compagnie (HTTP ${err.status}).`);
        this.companyId.set('');                   // pas de formulaire vide enregistrable par-dessus la vraie fiche
        this.loadingForm.set(false);
      }
    });
    this._loadContacts(id);
  }

  initials(name: string): string {
    const p = name.trim().split(' ');
    return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?';
  }

  // ── Soumettre la mise à jour ───────────────────────────
  /** Message affiché sous les taux tant qu'ils sont incomplets (mode « Heure »). */
  get hourlyRatesError(): string | null { return CompanyService.hourlyRatesError(this.form); }

  submit(): void {
    if (this.saving()) return;
    if (!this.companyId()) { this.error.set('Aucune compagnie sélectionnée.'); return; }
    if (!this.form.companyName.trim()) { this.error.set('Le nom est requis.'); return; }
    const ratesError = CompanyService.hourlyRatesError(this.form);
    if (ratesError) { this.error.set(ratesError); return; }

    this.log(`submit() → companyId=${this.companyId()} form.name=${this.form.companyName}`);
    this.error.set('');
    this.companySvc.reset();

    const id = this.companyId();
    const sent = JSON.stringify(this.form);
    this.companySvc.update(id, this.form).subscribe({
      next: () => {
        if (this.companyId() === id) this._loaded = sent;
        this.savedMsg.set('✓ Compagnie mise à jour');
        this.saved.set(true);
        this.log('✓ mise à jour réussie');
        this._loadList();
        setTimeout(() => this.saved.set(false), 3000);
      },
      error: err => {
        const backendMsg = err.error?.message ?? err.error?.detail ?? null;
        const msg = backendMsg ?? this.companySvc.error() ?? `Erreur ${err.status}`;
        this.warn('✕ update échoué:', msg, err.error);
        this.error.set(msg);
      }
    });
  }

  onFreqTravailChange(): void {
    this.form.semaine1       = this._emptySemaine();
    this.form.semaine2       = this._emptySemaine();
    this.form.joursBiMensuel = this._makeJours(15);
    this.form.joursMensuel   = [];
  }

  getJour(semaine: SemainePlanning, jour: string) {
    if (!(semaine as any)[jour]) {
      (semaine as any)[jour] = { actif: false, compagnie: 0, employe: 0 };
    }
    return (semaine as any)[jour];
  }

  // ── Mensuel ───────────────────────────────────────────
  addJourMensuel(): void {
    const used = new Set(this.form.joursMensuel.map(j => j.jour));
    const next = Array.from({length:31},(_,i)=>i+1).find(n => !used.has(n)) ?? 1;
    this.form.joursMensuel = [...this.form.joursMensuel, { jour: next, actif: true, compagnie: 0, employe: 0, applicatedDate: null }]
      .sort((a, b) => a.jour - b.jour);
    this.cdr.markForCheck();
  }

  onJourChange(index: number): void {
    const j = this.form.joursMensuel[index];
    j.jour = Math.max(1, Math.min(31, Math.round(+j.jour) || 1));
    const duplicate = this.form.joursMensuel.some((x, i) => i !== index && x.jour === j.jour);
    if (!duplicate) {
      this.form.joursMensuel = [...this.form.joursMensuel].sort((a, b) => a.jour - b.jour);
    }
    this.cdr.markForCheck();
  }

  removeJourMensuel(index: number): void {
    this.form.joursMensuel = this.form.joursMensuel.filter((_, i) => i !== index);
    this.cdr.markForCheck();
  }

  /** Annuler : remet la fiche telle qu'enregistrée ; sans modification en cours, ferme la fiche. */
  cancel(): void {
    if (this.isDirty()) {
      this.form = JSON.parse(this._loaded);
      this.error.set('');
      this.savedMsg.set('Modifications annulées');
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
      return;
    }
    this._loaded = '';
    this.companyId.set('');
    this.error.set('');
    if (this.route.snapshot.paramMap.get('id')) this.router.navigate(['/companies/edit']);
  }

  /** Les sept jours de chaque semaine existent toujours (l'API omet les jours sans planning). */
  private _normalize(form: CompanyForm): CompanyForm {
    const fill = (s: SemainePlanning | null | undefined): SemainePlanning => ({ ...this._emptySemaine(), ...this._clean(s) });
    return { ...form, semaine1: fill(form.semaine1), semaine2: fill(form.semaine2) };
  }

  private _clean(s: SemainePlanning | null | undefined): Partial<SemainePlanning> {
    return Object.fromEntries(Object.entries(s ?? {}).filter(([, v]) => v != null)) as Partial<SemainePlanning>;
  }

  private _emptyForm(): CompanyForm {
    return {
      companyName: '', companyCode: '', isActive: false, note: '',
      civicNumber: '', suite: '', city: '', state: 'QC', country: 'Canada',
      zipCode: '', addressNote: '',
      tps: '', tvq: '',
      frequencePaiement: 'hebdomadaire', frequenceTravail: 'hebdomadaire',
      semaine1: this._emptySemaine(), semaine2: this._emptySemaine(),
      joursBiMensuel: this._makeJours(15), joursMensuel: [],
      debutSemaine1: null,
      modeFacturation: 'Visite',
      tauxHoraireClient:  null,
      tauxHoraireEmploye: null,
    };
  }

  private _emptySemaine(): SemainePlanning {
    const j = () => ({ actif: false, compagnie: 0, employe: 0 });
    return { lundi:j(), mardi:j(), mercredi:j(), jeudi:j(), vendredi:j(), samedi:j(), dimanche:j() };
  }

  private _makeJours(count: number): JourMensuel[] {
    return Array.from({length: count}, (_, i) => ({ jour: i+1, actif: false, compagnie: 0, employe: 0 }));
  }
}
