import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Membre de « Mon équipe » (GET /api/team) — sans données sensibles. */
export interface TeamMember {
  employeeId:    string;
  name:          string;
  isTeamLead:    boolean;
  isActive:      boolean;
  employeeType:  string;
  /** null = sommet de la hiérarchie (ou sans chef). */
  managerId:     string | null;
  managerName:   string;
  /** « Mon équipe » : 0 = rattaché directement à moi. Hiérarchie : 0 = sommet. */
  depth:         number;
  directReports: number;
  /** Taille de l'équipe sous ce membre (directe + indirecte). */
  totalReports:  number;
  /** Employé non chef sans chef d'équipe (fiche à compléter). */
  missingManager: boolean;
}

export interface TeamNote {
  noteId:                string;
  title:                 string;
  description:           string;
  isActive:              boolean;
  createdAt:             string;
  createdByEmployeeName: string;
  links:                 { entityType: string; entityId: string; label?: string }[];
}

/** Équipe (directe + indirecte) de l'utilisateur connecté — consultation en lecture seule. */
@Injectable({ providedIn: 'root' })
export class TeamService {
  private _members = signal<TeamMember[]>([]);
  private _loaded  = signal(false);

  readonly members = this._members.asReadonly();
  readonly loaded  = this._loaded.asReadonly();
  /** Vrai si l'utilisateur supervise au moins une personne (affiche « Mon équipe »). */
  readonly hasTeam = computed(() => this._members().length > 0);

  constructor(private http: HttpClient) {}

  load(): void {
    this.http.get<TeamMember[]>('/api/team').subscribe({
      next:  m => { this._members.set(m ?? []); this._loaded.set(true); },
      error: () => { this._members.set([]); this._loaded.set(true); },
    });
  }

  clear(): void { this._members.set([]); this._loaded.set(false); }

  /** Organigramme complet de l'entreprise (permission employees.view). */
  hierarchy(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>('/api/team/hierarchy');
  }

  /** Notes liées à un membre (ou à toute l'équipe si employeeId absent). */
  notes(employeeId?: string): Observable<TeamNote[]> {
    const q = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
    return this.http.get<TeamNote[]>(`/api/team/notes${q}`);
  }
}
