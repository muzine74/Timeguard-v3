import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { AttachmentItem } from '../attachments/attachments.service';

export interface BankTransactionRow {
  bankTransactionId: string;
  date:        string;          // yyyy-MM-dd
  description: string;
  withdrawal:  number | null;
  deposit:     number | null;
  validated:   boolean;
  validatedAt: string | null;   // ISO UTC
  validatedBy: string | null;
  // Lien trouvé par le lexique (mot-clé contenu dans la description) ; null = aucun lien
  linkType:    BankLinkType | null;
  linkId:      string | null;
  linkName:    string | null;
  linkKeyword: string | null;
  /** N° de ligne du relevé (colonne 5) : identifiant affiché de la transaction. */
  lineNumber?: number | null;
  // Pièce jointe la plus récente (null = aucune) et son adresse de téléchargement
  attachment?:    AttachmentItem | null;
  attachmentUrl?: string | null;
  /** Toutes les pièces jointes, de la plus ancienne à la plus récente. */
  attachments?:   AttachmentItem[];
  // Note libre
  note?:          string | null;
  noteUpdatedAt?: string | null;   // ISO UTC
  noteUpdatedBy?: string | null;
  /** « bills » : dépôt direct / mobile → factures ; « charge » : retrait → une charge ; null : rien. */
  matchKind?:     BankMatchKind | null;
  matches?:       BankMatch[];
  /** Transaction initiale : la transaction qui l'annule. */
  cancelledBy?:   BankTransactionRef | null;
  /** Transaction d'annulation : la transaction initiale qu'elle annule. */
  cancels?:       BankTransactionRef | null;
}

export type BankMatchKind = 'bills' | 'charge';
export type BankMatchTarget = 'bill' | 'charge';

/** Autre transaction du relevé (annulation ↔ transaction initiale). */
export interface BankTransactionRef {
  bankTransactionId: string;
  date:        string;
  lineNumber:  number | null;
  description: string;
  withdrawal:  number | null;
  deposit:     number | null;
}

/** Facture ou charge associée à une transaction. */
export interface BankMatch {
  id:             string;
  targetType:     BankMatchTarget;
  billIdentifier: number | null;
  targetId:       string | null;
  label:          string | null;   // null = l'élément n'existe plus
  companyName:    string | null;
  date:           string | null;
  amount:         number;
  isPaid:         boolean;
  setBillPaid:    boolean;
}

export interface BankMatchCandidate {
  targetType:     BankMatchTarget;
  billIdentifier: number | null;
  targetId:       string | null;
  label:          string;
  companyName:    string | null;
  date:           string | null;
  amount:         number;
  isPaid:         boolean;
}

export interface BankMatchCandidates {
  matchKind: BankMatchKind | null;
  remaining: number;
  items:     BankMatchCandidate[];
}

/** Identifiant affiché d'une transaction : son n° de ligne, sinon le début de son identifiant. */
export function txRef(t: { lineNumber?: number | null; bankTransactionId: string }): string {
  return t.lineNumber != null ? `#${t.lineNumber}` : `#${t.bankTransactionId.slice(0, 8)}`;
}

/** Vrai si la description contient « Dépôt Mobile » (majuscules et accents ignorés), comme côté serveur. */
export function isMobileDeposit(description: string | null | undefined): boolean {
  const plain = (description ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /\bdepot\s+mobile\b/i.test(plain);
}

export type BankLinkType = 'company' | 'employee' | 'charge';

/** Lexique : un mot-clé cherché dans la description, relié à une compagnie, un employé ou une charge. */
export interface BankLexiconEntry {
  id:         string;
  keyword:    string;
  targetType: BankLinkType;
  targetId:   string;
  targetName: string | null;      // null = l'élément n'existe plus
  matchCount: number;             // transactions reliées par ce mot-clé
}

export interface BankLexicon {
  entries:  BankLexiconEntry[];
  unlinked: { description: string; count: number }[];
  totalTransactions:  number;
  linkedTransactions: number;
}

export interface BankLexiconTarget { id: string; name: string; }
export interface BankLexiconTargets {
  companies: BankLexiconTarget[];
  employees: BankLexiconTarget[];
  charges:   BankLexiconTarget[];
}

export interface BankTransactionList {
  rows: BankTransactionRow[];
  totalWithdrawals: number;
  totalDeposits:    number;
}

/** Résultat d'un import de relevé CSV. */
export interface BankImportResult {
  imported:   number;           // lignes ajoutées
  duplicates: number;           // déjà en base : non ajoutées
  conflicts?: number;           // même date + n° de ligne qu'une ligne enregistrée, contenu différent : non ajoutées
  conflictDetails?: string[];
  skipped:    number;           // lignes illisibles
  dateMin:    string | null;
  dateMax:    string | null;
  totalWithdrawals: number;
  totalDeposits:    number;
  errors:     string[];
}

@Injectable({ providedIn: 'root' })
export class BankTransactionsService {
  constructor(private http: HttpClient) {}

  list(from?: string, to?: string) {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to)   params = params.set('to', to);
    return this.http.get<BankTransactionList>('/api/bank-transactions', { params });
  }

  getLexicon()        { return this.http.get<BankLexicon>('/api/bank-lexicon'); }
  getLexiconTargets() { return this.http.get<BankLexiconTargets>('/api/bank-lexicon/targets'); }
  addLexiconEntry(keyword: string, targetType: BankLinkType, targetId: string) {
    return this.http.post<BankLexiconEntry>('/api/bank-lexicon', { keyword, targetType, targetId });
  }
  deleteLexiconEntry(id: string) { return this.http.delete<void>(`/api/bank-lexicon/${id}`); }

  setValidated(id: string, validated: boolean) {
    return this.http.put<BankTransactionRow>(`/api/bank-transactions/${id}/validated`, { validated });
  }

  get(id: string) { return this.http.get<BankTransactionRow>(`/api/bank-transactions/${id}`); }
  setNote(id: string, note: string) { return this.http.put<BankTransactionRow>(`/api/bank-transactions/${id}/note`, { note }); }
  candidates(id: string, q = '') {
    return this.http.get<BankMatchCandidates>(`/api/bank-transactions/${id}/candidates`, { params: new HttpParams().set('q', q) });
  }
  addMatch(id: string, c: Pick<BankMatchCandidate, 'targetType' | 'billIdentifier' | 'targetId'>) {
    return this.http.post<BankTransactionRow>(`/api/bank-transactions/${id}/matches`,
      { targetType: c.targetType, billIdentifier: c.billIdentifier, targetId: c.targetId });
  }
  removeMatch(id: string, matchId: string) {
    return this.http.delete<BankTransactionRow>(`/api/bank-transactions/${id}/matches/${matchId}`);
  }

  /** Fichier de la pièce jointe d'une ligne, à partir de son adresse (attachmentUrl). */
  openAttachment(url: string) { return this.http.get(url, { responseType: 'blob' as const }); }

  /** Colonnes lues (à partir de 1) : 4 = date, 6 = description, 8 = retrait, 9 = dépôt. */
  importCsv(file: File) {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<BankImportResult>('/api/bank-transactions/import', body);
  }
}
