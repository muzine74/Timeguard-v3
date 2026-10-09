import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

export interface StatsEmployeeRow {
  employeeId:            string;
  employeeName:          string;
  nbVisites:             number;
  totalPaiementEmploye:  number;
  /** Part des versements « transférés » sur les journées de la période (avant taxes). */
  montantTransfere?:     number;
  statutPaiement?:       StatsPaymentStatus;
}

/** Une compagnie dans la comparaison de facturation : théorique du planning / factures envoyées (hors taxes). */
export interface StatsBillingComparisonRow {
  companyId:   string;
  companyName: string;
  theoriqueHT: number;
  envoyeHT:    number;
  ecart:       number;      // théorique − envoyé ; 0 = pareil
  factures:    string[];    // numéros des factures (et avoirs) envoyées
}

export type StatsPaymentStatus = 'paye' | 'partiel' | 'nonpaye';
export const PAYMENT_STATUS_LABEL: Record<StatsPaymentStatus, string> =
  { paye: 'Payé', partiel: 'Partiellement payé', nonpaye: 'Non payé' };

export interface StatsCompanyRow {
  companyId:    string;
  companyName:  string;
  companyCode:  string;
  nbFactures:   number;
  nbAvoirs:     number;
  nbVisites:    number;
  totalHT:      number;
  totalTPS:     number;
  totalTVQ:     number;
  totalTTC:     number;
  totalAvoirs:  number;
  montantPaye:  number;
  aPayee:       boolean;
  factures:     StatsInvoiceRow[];
}

/** Facture (ou avoir : montants négatifs) d'une compagnie sur la période. */
export interface StatsInvoiceRow {
  billIdentifier:       number;
  billNumber:           string;
  period:               string;
  billedDate:           string;
  nbVisites:            number;
  totalHT:              number;
  totalTPS:             number;
  totalTVQ:             number;
  totalTTC:             number;
  isAvoir:              boolean;
  parentBillIdentifier: number | null;
  isSent:               boolean;
  isPaid:               boolean;
  paidDate:             string | null;
}

export interface StatsResponse {
  dateDebut:          string;
  dateFin:            string;
  nbFactures:               number;
  nbCompagnies:             number;
  nbVisitesTotal:           number;
  totalHT:                  number;
  totalTPS:                 number;
  totalTVQ:                 number;
  totalTTC:                 number;
  totalPaye:                number;
  totalEnAttente:           number;
  totalPaiementsEmployes:   number;
  gain:                     number;
  // Cartes (HT = sans taxes, TTC = avec taxes)
  totalTheoriqueHT:         number;   // planning des compagnies actives
  totalTheoriqueTTC:        number;
  nbPlanningIncomplet:      number;   // bi-hebdo sans date de début : non comptées
  totalEnvoyeHT:            number;
  totalEnvoyeTTC:           number;
  totalPayeHT:              number;
  totalEnAttenteHT:         number;
  chargesEmployes:          number;   // paie de tous les pointages de la période
  // Avec les taxes du profil de chaque employé (TPS s'il a un numéro TPS, TVQ s'il a un numéro TVQ)
  chargesEmployesTTC:             number;
  paiementsEmployesAEffectuerTTC: number;
  paiementsEmployesEffectuesTTC:  number;
  paiementsEmployesAEffectuer: number; // semaines validées (ce qui devrait être payé)
  paiementsEmployesEffectues:  number; // montants enregistrés sur ces semaines
  tpsRate:                  number;   // %
  tvqRate:                  number;   // %
  // Registre bancaire : lignes du relevé bancaire chargé, datées dans la période
  banqueDepots?:            number;
  banqueRetraits?:          number;
  banqueNbTransactions?:    number;
  banqueNbValidees?:        number;
  /** Registre bancaire : factures payées dans la période (date de paiement). */
  banqueFacturesPayees?:    { billNumber: string; companyName: string; paidDate: string; totalHT: number; totalTTC: number }[];
  /** Registre bancaire : versements employés « transférés » dont la date de paiement est dans la période. */
  banquePaiements?:         { employeeId: string; employeeName: string; paymentDate: string; weekStart: string; amountHT: number; taxes: number; total: number }[];
  /** Registre bancaire : charges de la période (mensuelle : une fois par mois). Total avec taxes. */
  banqueCharges?:           { title: string; date: string; isMonthly: boolean; occurrences: number; total: number }[];
  /** Comparaison de facturation par compagnie (hors taxes). */
  comparaisonFacturation?:  StatsBillingComparisonRow[];
  parEmploye:              StatsEmployeeRow[];
  parCompagnie:             StatsCompanyRow[];
}

export interface StatsEmployeeCompanyItem {
  companyId:     string;
  companyName:   string;
  nbVisites:     number;
  totalPaiement: number;
  visitDates:    string[]; // yyyy-MM-dd
  /** Part des versements « transférés » qui revient à cette compagnie (avant taxes). */
  montantTransfere?: number;
  /** Dates de visite dont la paie est entièrement transférée. */
  paidDates?:    string[];
}

export interface StatsEmployeeDetailResponse {
  employeeId:   string;
  employeeName: string;
  dateDebut:    string;
  dateFin:      string;
  companies:    StatsEmployeeCompanyItem[];
}

export interface StatsCompanyEmployeeItem {
  employeeId:   string;
  employeeName: string;
  nbVisites:    number;
  workDates:    string[]; // yyyy-MM-dd — semaines validées uniquement
}

export interface StatsCompanyDetailResponse {
  companyId:   string;
  companyName: string;
  dateDebut:   string;
  dateFin:     string;
  employees:   StatsCompanyEmployeeItem[];
}

/** Détail d'une carte de la page Statistiques : les lignes qui composent son montant. */
export type StatsCardKey = 'theorique' | 'envoyees' | 'paye' | 'attente' | 'charges' | 'aeffectuer' | 'effectues';
export type StatsDetailCell = string | number | null;

export interface StatsCardDetail {
  key:         string;
  title:       string;
  explanation: string;
  dateDebut:   string;
  dateFin:     string;
  columns:     { header: string; type: 'text' | 'int' | 'money' }[];
  rows:        StatsDetailCell[][];
  totalRow:    StatsDetailCell[];
  summary:     { label: string; amount: number }[];
}

/** Params de plage de dates communs — mêmes règles que GET /api/stats. */
export interface StatsRangeParams {
  period?: string;
  from?:   string;
  to?:     string;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  constructor(private http: HttpClient) {}

  getByPeriod(period: string) {
    const params = new HttpParams().set('period', period);
    return this.http.get<StatsResponse>('/api/stats', { params });
  }

  getByRange(from: string, to: string) {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<StatsResponse>('/api/stats', { params });
  }

  getEmployeeDetail(employeeId: string, range: StatsRangeParams) {
    return this.http.get<StatsEmployeeDetailResponse>(
      `/api/stats/employee/${employeeId}`, { params: this._toParams(range) }
    );
  }

  getCardDetail(key: string, range: StatsRangeParams) {
    return this.http.get<StatsCardDetail>(`/api/stats/card/${encodeURIComponent(key)}`, { params: this._toParams(range) });
  }

  getCompanyDetail(companyId: string, range: StatsRangeParams) {
    return this.http.get<StatsCompanyDetailResponse>(
      `/api/stats/company/${companyId}`, { params: this._toParams(range) }
    );
  }

  private _toParams(range: StatsRangeParams): HttpParams {
    let params = new HttpParams();
    if (range.period) params = params.set('period', range.period);
    if (range.from)   params = params.set('from', range.from);
    if (range.to)     params = params.set('to', range.to);
    return params;
  }
}
