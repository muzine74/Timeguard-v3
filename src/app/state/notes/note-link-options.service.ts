import { Injectable, computed, signal } from '@angular/core';
import { EmployeesService } from '../employees/employees.service';
import { CompanyService } from '../compagny/Company.service';
import { InvoiceService } from '../invoice/invoice.service';
import { NoteLinkType } from './notes.service';
import { httpErrorMessage } from '../../vue/shared/http-error';

export interface NoteLinkOption { id: string; label: string; }

/**
 * Listes des entités auxquelles une note peut être liée (employés, compagnies, factures).
 * Chargées une seule fois à la demande via les services existants, partagées entre
 * l'éditeur de liens et les filtres de la page Notes.
 */
@Injectable({ providedIn: 'root' })
export class NoteLinkOptionsService {
  // Liste mémorisée : mêmes objets tant que la liste des employés ne change pas
  // (sinon les <option> sont recréées à chaque rendu et le <select> perd sa sélection).
  private readonly employees = computed<NoteLinkOption[]>(() =>
    this.empSvc.list()
      .map(e => ({ id: e.employeeId, label: e.employeeName }))
      .sort((a, b) => a.label.localeCompare(b.label)));
  private readonly companies = signal<NoteLinkOption[] | null>(null);
  private readonly bills     = signal<NoteLinkOption[] | null>(null);
  /** Dernière erreur de chargement (affichée par l'éditeur ; ignorée par les filtres). */
  readonly error = signal('');

  constructor(
    private empSvc:     EmployeesService,
    private companySvc: CompanyService,
    private invoiceSvc: InvoiceService,
  ) {}

  options(type: NoteLinkType | ''): NoteLinkOption[] {
    switch (type) {
      case 'employee': return this.employees();
      case 'company':  return this.companies() ?? [];
      case 'bill':     return this.bills() ?? [];
      default:         return [];
    }
  }

  /** trackBy des <option> : garde les éléments DOM (et donc la sélection) entre deux rendus. */
  readonly trackById = (_: number, o: NoteLinkOption) => o.id;

  label(type: NoteLinkType, id: string): string | undefined {
    const key = id.toLowerCase();
    return this.options(type).find(o => o.id.toLowerCase() === key)?.label;
  }

  /** silent : pas de message d'erreur (préchargement des filtres, droits variables selon l'utilisateur). */
  ensure(type: NoteLinkType, silent = false): void {
    const fail = (err: { status?: number }) => {
      if (!silent) this.error.set(httpErrorMessage(err, `Impossible de charger la liste`));
    };

    if (type === 'employee' && this.empSvc.list().length === 0) {
      this.empSvc.loadList();
    } else if (type === 'company' && this.companies() === null) {
      this.companies.set([]);   // évite les appels concurrents
      this.companySvc.getAll().subscribe({
        next: list => this.companies.set(list
          .map(c => ({ id: c.companyId, label: c.companyName }))
          .sort((a, b) => a.label.localeCompare(b.label))),
        error: err => { this.companies.set(null); fail(err); },
      });
    } else if (type === 'bill' && this.bills() === null) {
      this.bills.set([]);
      this.invoiceSvc.getAll().subscribe({
        next: list => this.bills.set(list
          .filter(b => b.parentBillIdentifier === null)
          .map(b => ({ id: b.billId, label: `${b.billNumber} — ${b.companyName}` }))),
        error: err => { this.bills.set(null); fail(err); },
      });
    }
  }
}
