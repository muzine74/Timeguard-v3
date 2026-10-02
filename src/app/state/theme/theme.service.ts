import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export type ThemeId = 'nuit' | 'ocean' | 'foret' | 'amethyste' | 'braise' | 'graphite'
                    | 'jour' | 'ciel' | 'rose' | 'menthe' | 'sable' | 'lavande';

export interface ThemeOption {
  id:     ThemeId;
  label:  string;
  hint:   string;
  dark:   boolean;
  /** Aperçu : fond, surface, accent. */
  swatch: [string, string, string];
}

/** Les 12 designs — 6 sombres, 6 clairs (valeurs dans styles.scss — [data-theme="…"]). */
export const THEMES: ThemeOption[] = [
  { id: 'nuit',  label: 'Nuit',  hint: 'Sombre · doré',       dark: true,  swatch: ['#080b14', '#111827', '#c9a227'] },
  { id: 'ocean', label: 'Océan', hint: 'Sombre · bleu cyan',  dark: true,  swatch: ['#061219', '#0f2430', '#2cc4d8'] },
  { id: 'foret', label: 'Forêt', hint: 'Sombre · vert émeraude', dark: true, swatch: ['#07130d', '#10261b', '#3ccf8e'] },
  { id: 'amethyste', label: 'Améthyste', hint: 'Sombre · violet', dark: true, swatch: ['#0e0a17', '#1c142d', '#b48cff'] },
  { id: 'braise', label: 'Braise', hint: 'Sombre · orange braise', dark: true, swatch: ['#140b07', '#261710', '#ff8a4c'] },
  { id: 'graphite', label: 'Graphite', hint: 'Sombre · gris et citron', dark: true, swatch: ['#0c0d0f', '#1a1d21', '#c6e94d'] },
  { id: 'jour',  label: 'Jour',  hint: 'Clair · ivoire et or', dark: false, swatch: ['#f5f3ee', '#ffffff', '#7a5a00'] },
  { id: 'ciel',  label: 'Ciel',  hint: 'Clair · bleu',        dark: false, swatch: ['#eef3fa', '#ffffff', '#1747a6'] },
  { id: 'rose',  label: 'Rosé',  hint: 'Clair · rose framboise', dark: false, swatch: ['#fbf3f1', '#ffffff', '#a6324a'] },
  { id: 'menthe', label: 'Menthe', hint: 'Clair · vert d’eau', dark: false, swatch: ['#eef7f4', '#ffffff', '#08695a'] },
  { id: 'sable', label: 'Sable', hint: 'Clair · beige et terre cuite', dark: false, swatch: ['#f7f1e8', '#ffffff', '#93421a'] },
  { id: 'lavande', label: 'Lavande', hint: 'Clair · lilas et violet', dark: false, swatch: ['#f4f2fb', '#ffffff', '#5b3fb8'] },
];

const STORAGE_KEY = 'tg_theme';
const isTheme = (v: unknown): v is ThemeId => THEMES.some(t => t.id === v);

/**
 * Design de couleurs de l'utilisateur :
 *   • appliqué immédiatement au démarrage depuis ce navigateur (pas de flash de couleurs) ;
 *   • enregistré sur le COMPTE (PUT /api/preferences/theme) et retrouvé à chaque connexion, sur tout appareil.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private _current = signal<ThemeId>('nuit');
  readonly current = this._current.asReadonly();
  readonly themes  = THEMES;
  readonly darkThemes  = THEMES.filter(t => t.dark);
  readonly lightThemes = THEMES.filter(t => !t.dark);
  /** Sélecteur : groupes « Sombres » / « Clairs ». */
  readonly groups = [
    { label: 'Sombres', themes: THEMES.filter(t => t.dark) },
    { label: 'Clairs',  themes: THEMES.filter(t => !t.dark) },
  ];

  constructor(private http: HttpClient) {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* stockage indisponible */ }
    this._apply(isTheme(saved) ? saved : 'nuit');
  }

  /** Après connexion : le design enregistré sur le compte prime sur celui du navigateur. */
  syncFromAccount(): void {
    this.http.get<{ theme: string | null }>('/api/preferences').subscribe({
      next: p => { if (isTheme(p?.theme)) this._apply(p!.theme as ThemeId); },
      error: () => { /* garde le design local */ },
    });
  }

  /** Choix de l'utilisateur : appliqué tout de suite, mémorisé localement et sur son compte. */
  choose(id: ThemeId): void {
    if (!isTheme(id)) return;
    this._apply(id);
    this.http.put('/api/preferences/theme', { theme: id }).subscribe({ error: () => { /* reste local (ex. sans fiche employé) */ } });
  }

  private _apply(id: ThemeId): void {
    this._current.set(id);
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* stockage indisponible */ }
  }
}
