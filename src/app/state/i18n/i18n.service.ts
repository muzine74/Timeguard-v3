import { Injectable, NgZone, signal } from '@angular/core';

export type Lang = 'fr' | 'en' | 'es' | 'it';
export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: 'fr', label: 'Français', short: 'FR' },
  { id: 'en', label: 'English',  short: 'EN' },
  { id: 'es', label: 'Español',  short: 'ES' },
  { id: 'it', label: 'Italiano', short: 'IT' },
];

/** Dictionnaire d'une langue : textes exacts, et modèles à trous ({0}, {1}…) pour les textes composés. */
interface Dictionary { exact: Record<string, string>; patterns: [string, string][]; }
interface Pattern { rx: RegExp; out: string; }
interface Memo { src: string; out: string; }

const STORAGE_KEY = 'tg_lang';
const DEBUG_KEY   = 'tg_i18n_debug';
const LOCALES: Record<Lang, string> = { fr: 'fr-CA', en: 'en-CA', es: 'es', it: 'it' };

function storedLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'es' || v === 'it' || v === 'fr') return v;
  } catch { /* stockage indisponible */ }
  return 'fr';
}

/** Langue affichée. Lue dans un gabarit (même à travers `locale()`), elle rafraîchit la vue au changement de langue. */
export const currentLang = signal<Lang>(storedLang());

/** Paramètre de langue pour les dates : `date.toLocaleDateString(locale(), …)`. */
export function locale(): string { return LOCALES[currentLang()]; }
const ATTRIBUTES  = ['placeholder', 'title', 'aria-label', 'alt'];
const SKIP_TAGS   = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

/**
 * Langue d'affichage. L'application est écrite en français ; pour une autre langue, les textes sont
 * remplacés À L'AFFICHAGE à partir d'un dictionnaire (i18n/en.json…), sans toucher aux gabarits :
 *
 *  - un texte présent tel quel dans le dictionnaire est remplacé ;
 *  - un texte composé (« 3 semaines », « Supprimer la charge « Loyer » ? ») passe par un modèle à trous ;
 *  - tout le reste — noms, montants, données saisies, texte absent du dictionnaire — reste inchangé.
 *
 * Un observateur du document traduit ce qu'Angular ajoute ou modifie. Le texte français d'origine est
 * conservé pour chaque nœud, ce qui permet de revenir au français ou de changer de langue sans recharger.
 * Les messages de l'API arrivent en français et sont traduits ici comme les autres textes. Ce qui ne passe
 * pas par le document (exports Excel / PDF, courriels proposés) utilise `t`, `tText` et `tLines`.
 * Les PDF et courriels écrits par l'API suivent l'en-tête X-Lang (voir jwt.interceptor).
 *
 * Textes sans traduction : `localStorage.tg_i18n_debug = '1'`, puis `window.__tgI18nMissing` les liste.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = currentLang;
  /** Vrai pendant le chargement d'un dictionnaire. */
  readonly loading = signal(false);

  private _exact = new Map<string, string>();
  private _patterns: Pattern[] = [];
  private _cache = new Map<string, string | null>();
  private _texts = new WeakMap<Node, Memo>();
  private _attrs = new WeakMap<Element, Record<string, Memo>>();
  private _observer?: MutationObserver;
  private _pending = false;
  private _missing: Set<string> | null = null;

  constructor(private zone: NgZone) {
    try {
      if (localStorage.getItem(DEBUG_KEY) === '1')
        (window as unknown as { __tgI18nMissing: Set<string> }).__tgI18nMissing = this._missing = new Set<string>();
    } catch { /* stockage indisponible */ }
  }

  /** À appeler une fois au démarrage : applique la langue mémorisée et surveille le document. */
  start(): void {
    this.zone.runOutsideAngular(() => {
      this._observer = new MutationObserver(() => this._schedule());
      this._observer.observe(document.documentElement, {
        subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES,
      });
    });
    void this.use(this.lang());
  }

  async use(lang: Lang): Promise<void> {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* stockage indisponible */ }
    if (lang === 'fr') {
      this._setDictionary(null);
    } else {
      this.loading.set(true);
      try {
        const res = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(String(res.status));
        this._setDictionary(await res.json() as Dictionary);
      } catch {
        // Dictionnaire indisponible : l'application reste en français plutôt que d'afficher un mélange
        lang = 'fr';
        this._setDictionary(null);
      } finally {
        this.loading.set(false);
      }
    }
    this.lang.set(lang);
    document.documentElement.lang = lang;
    this._apply();
  }

  /** Traduction d'un texte isolé (libellés construits dans le code) ; renvoie le texte tel quel s'il est inconnu. */
  t(text: string): string { return this._translate(text) ?? text; }

  /**
   * Texte composé hors document (sous-titre d'export, filtre) : traduit en entier s'il est connu, sinon
   * morceau par morceau — « Statut : Payées | Date d'envoi : du … au … ».
   */
  tText(text: string): string {
    if (!text || this.lang() === 'fr') return text;
    const whole = this._translate(text);
    if (whole !== null) return whole;
    return text.split(/( \| | — | · )/).map(part => {
      if (/^ (\||—|·) $/.test(part)) return part;
      const tr = this._translate(part);
      if (tr !== null) return tr;
      const at = part.indexOf(' : ');
      return at < 0 ? part : this.t(part.slice(0, at)) + ': ' + this.t(part.slice(at + 3));
    }).join('');
  }

  /** Texte de plusieurs lignes (corps de courriel) : chaque ligne est traduite, les sauts de ligne sont conservés. */
  tLines(text: string): string {
    return this.lang() === 'fr' ? text : text.split('\n').map(line => this._render(line)).join('\n');
  }

  private _setDictionary(d: Dictionary | null): void {
    this._cache.clear();
    this._exact = new Map(Object.entries(d?.exact ?? {}));
    this._patterns = (d?.patterns ?? []).map(([src, out]) => ({ rx: this._compile(src), out }));
  }

  /** « {0} semaine{1} » → expression régulière : chaque trou capte un texte court, le reste est littéral. */
  private _compile(src: string): RegExp {
    // {0} : texte libre ; {0#} : seulement une date, une heure ou un nombre ; {0!} : un seul mot (numéro de facture)
    const hole: Record<string, string> = { '': '(.*?)', '#': '([\\d/:.,+\\- ]+?)', '!': '(\\S+?)' };
    const body = src.split(/(\{\d+[#!]?\})/).map(part => {
      const m = /^\{\d+([#!]?)\}$/.exec(part);
      return m ? hole[m[1]] : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    }).join('');
    return new RegExp('^' + body + '$', 's');
  }

  private _translate(source: string, nested = false): string | null {
    if (this._exact.size === 0 && this._patterns.length === 0) return null;
    const key = source.replace(/\s+/g, ' ').trim();
    if (!key) return null;
    const cached = this._cache.get(key);
    if (cached !== undefined) return cached;

    let out: string | null = this._exact.get(key) ?? null;
    if (out === null && /[A-Za-zÀ-ÿ]{2}/.test(key)) {
      for (const p of this._patterns) {
        const m = p.rx.exec(key);
        if (!m) continue;
        // {n} : texte capté (traduit s'il est lui-même connu) ; {n|a|b} : « a » si le trou est vide, « b » sinon (pluriels)
        out = p.out.replace(/\{(\d+)(?:\|([^|}]*)\|([^}]*))?\}/g, (_all, i, ifEmpty, ifSet) => {
          const value = (m[Number(i) + 1] ?? '');
          if (ifEmpty !== undefined) return value.trim() === '' ? ifEmpty : ifSet;
          // Un message peut en contenir un autre : « Ligne 3 : date invalide « … » » (un seul niveau)
          return (nested ? this._exact.get(value.replace(/\s+/g, ' ').trim()) : this._translate(value, true)) ?? value;
        });
        break;
      }
    }
    if (nested) return out;
    if (out === null && this._missing && /[A-Za-zÀ-ÿ]{3}/.test(key)) this._missing.add(key);
    if (this._cache.size > 5000) this._cache.clear();
    this._cache.set(key, out);
    return out;
  }

  private _schedule(): void {
    if (this._pending) return;
    this._pending = true;
    requestAnimationFrame(() => { this._pending = false; this._apply(); });
  }

  /** Parcourt le document : chaque texte et attribut est mis dans la langue courante. */
  private _apply(): void {
    const body = document.body;
    if (!body) return;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          return SKIP_TAGS.has(el.tagName) || el.hasAttribute('data-no-i18n') || (el as HTMLElement).isContentEditable
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) this._text(node as Text);
      else this._element(node as Element);
    }
  }

  private _text(node: Text): void {
    const current = node.nodeValue ?? '';
    const memo = this._texts.get(node);
    // Valeur différente de notre dernière écriture : Angular a mis un nouveau texte français
    const src = memo && memo.out === current ? memo.src : current;
    const next = this._render(src);
    if (next !== current) node.nodeValue = next;
    if (next !== src) this._texts.set(node, { src, out: next });
    else if (memo) this._texts.delete(node);
  }

  private _element(el: Element): void {
    let memos = this._attrs.get(el);
    for (const name of ATTRIBUTES) {
      const current = el.getAttribute(name);
      if (current === null) continue;
      const memo = memos?.[name];
      const src = memo && memo.out === current ? memo.src : current;
      const next = this._render(src);
      if (next !== current) el.setAttribute(name, next);
      if (next !== src) { (memos ??= {})[name] = { src, out: next }; this._attrs.set(el, memos); }
      else if (memo && memos) delete memos[name];
    }
  }

  /** Texte dans la langue courante, espaces de début et de fin conservés. */
  private _render(src: string): string {
    const tr = this._translate(src);
    if (tr === null) return src;
    const lead = /^\s*/.exec(src)![0], trail = /\s*$/.exec(src)![0];
    return lead + tr + trail;
  }
}
