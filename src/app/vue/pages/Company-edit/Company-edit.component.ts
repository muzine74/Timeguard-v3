import { Component, OnInit, signal, computed, isDevMode, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './company-edit.component.html',
  styleUrls: ['./company-edit.component.scss'],
})
export class CompanyEditComponent implements OnInit {
  saved       = signal(false);
  error       = signal('');
  loadingList = signal(true);
  loadingForm = signal(false);

  // ── Contacts ──────────────────────────────────────────
  contacts        = signal<ContactItem[]>([]);
  contactsLoading = signal(false);
  contactError    = signal('');
  showContactForm = signal(false);
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
    const q = this.searchQuery.toLowerCase();
    return q ? list.filter(c => c.companyName.toLowerCase().includes(q)) : list;
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
        this.contacts.set(list);
        this.contactsLoading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
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
    if (!this.contactForm.name.trim()) { this.contactError.set('Le nom est requis.'); return; }
    const id = this.companyId();
    if (!id) return;
    const editing = this.editingContact();

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
          this._loadContacts(id);
          this.showContactForm.set(false);
          this.editingContact.set(null);
        },
        error: () => this.contactError.set('Erreur lors de la modification.')
      });
    } else {
      this.companySvc.addContact(id, req).subscribe({
        next: () => {
          this._loadContacts(id);
          this.showContactForm.set(false);
        },
        error: () => this.contactError.set('Erreur lors de l\'ajout.')
      });
    }
  }

  toggleContact(c: ContactItem): void {
    const id = this.companyId();
    if (!id) return;
    this.companySvc.toggleContact(id, c.contactId).subscribe({
      next: () => this._loadContacts(id),
      error: () => this.contactError.set('Erreur lors du changement de statut.')
    });
  }

  deleteContact(c: ContactItem): void {
    const id = this.companyId();
    if (!id) return;
    this.companySvc.deleteContact(id, c.contactId).subscribe({
      next: () => this._loadContacts(id),
      error: () => this.contactError.set('Erreur lors de la suppression.')
    });
  }

  // ── Charger la liste sidebar ──────────────────────────
  private _loadList(): void {
    this.loadingList.set(true);
    this.companySvc.getAll().subscribe({
      next: list => {
        this.companies = list;
        this.loadingList.set(false);
        this.log(`✓ ${list.length} compagnie(s) chargée(s)`);
      },
      error: err => {
        this.warn(`✕ getAll() échoué (${err.status})`);
        this.loadingList.set(false);
      }
    });
  }

  // ── Sélectionner une compagnie → remplir le formulaire ─
  selectCompany(id: string): void {
    if (id === this.companyId()) return;
    this.companyId.set(id);
    this.error.set('');
    this.saved.set(false);
    this.loadingForm.set(true);
    this.log(`selectCompany(${id})`);

    this.companySvc.getById(id).subscribe({
      next: data => {
        this.form = data;
        this.loadingForm.set(false);
        this.showContactForm.set(false);
        this.editingContact.set(null);
        this.cdr.markForCheck();
        this.log('✓ formulaire rempli:', data.companyName);
      },
      error: err => {
        this.warn(`✕ getById(${id}) échoué (${err.status})`);
        this.error.set(`Impossible de charger — HTTP ${err.status}`);
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
  submit(): void {
    if (!this.companyId()) { this.error.set('Aucune compagnie sélectionnée.'); return; }
    if (!this.form.companyName.trim()) { this.error.set('Le nom est requis.'); return; }

    this.log(`submit() → companyId=${this.companyId()} form.name=${this.form.companyName}`);
    this.error.set('');
    this.companySvc.reset();

    this.companySvc.update(this.companyId(), this.form).subscribe({
      next: () => {
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
    this.form.joursMensuel.push({ jour: next, actif: true, compagnie: 0, employe: 0 });
    this.form.joursMensuel.sort((a, b) => a.jour - b.jour);
  }

  stepJourLigne(index: number, delta: number): void {
    const j = this.form.joursMensuel[index];
    const next = Math.max(1, Math.min(31, j.jour + delta));
    const used = new Set(this.form.joursMensuel.map((x, i) => i !== index ? x.jour : null));
    if (!used.has(next)) j.jour = next;
  }

  removeJourMensuel(index: number): void { this.form.joursMensuel.splice(index, 1); }

  cancel(): void { this.router.navigate(['/employees']); }

  private _emptyForm(): CompanyForm {
    return {
      companyName: '', companyCode: '', isActive: false, note: '',
      civicNumber: '', suite: '', city: '', state: 'QC', country: 'Canada',
      zipCode: '', addressNote: '',
      tps: '', tvq: '',
      frequencePaiement: 'hebdomadaire', frequenceTravail: 'hebdomadaire',
      semaine1: this._emptySemaine(), semaine2: this._emptySemaine(),
      joursBiMensuel: this._makeJours(15), joursMensuel: [],
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
