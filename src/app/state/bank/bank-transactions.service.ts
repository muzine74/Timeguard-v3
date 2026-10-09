import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

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

  /** Colonnes lues (à partir de 1) : 4 = date, 6 = description, 8 = retrait, 9 = dépôt. */
  importCsv(file: File) {
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<BankImportResult>('/api/bank-transactions/import', body);
  }
}
