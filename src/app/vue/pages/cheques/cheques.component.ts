import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { todayIso } from '../../shared/dates';
import { amountInWords } from './amount-words';

/** Emplacement du chèque sur la feuille Lettre (3 parties égales). */
type ChequePosition = 'top' | 'middle' | 'bottom';

interface ChequeLayout {
  position: ChequePosition;
  /** Décalage de tout le texte, en millimètres : positif = vers la droite / vers le bas. */
  offsetX: number;
  offsetY: number;
  /** Imprime un rappel du chèque (date, bénéficiaire, montant, objet) sur les deux autres parties de la feuille. */
  stubs: boolean;
  /** Imprime aussi le cadre et les libellés : pour un essai sur papier blanc, pas sur un vrai chèque. */
  frame: boolean;
}

const LAYOUT_KEY = 'tg_cheque_layout';
const DEFAULT_LAYOUT: ChequeLayout = { position: 'top', offsetX: 0, offsetY: 0, stubs: true, frame: false };
/** Feuille Lettre : 215,9 × 279,4 mm, en trois parties de 93,13 mm. */
const PART_MM = 279.4 / 3;

/**
 * Chèques : saisir un chèque (date, bénéficiaire, montant, objet) et l'imprimer sur une feuille de chèques
 * préimprimée (feuille Lettre, un chèque et deux talons). Seul le texte variable est imprimé ; le montant en
 * lettres est écrit automatiquement. Rien n'est enregistré : la mise en page est gardée dans le navigateur.
 */
@Component({
    selector: 'app-cheques',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './cheques.component.html',
    styleUrls: ['./cheques.component.scss']
})
export class ChequesComponent {
  // ── Chèque ────────────────────────────────────────────────────────────────
  date   = signal(todayIso());
  payee  = signal('');
  amount = signal<number | null>(null);
  memo   = signal('');

  // ── Mise en page (mémorisée dans ce navigateur) ───────────────────────────
  layout = signal<ChequeLayout>(this._storedLayout());
  readonly positions: { id: ChequePosition; label: string }[] = [
    { id: 'top', label: 'En haut' }, { id: 'middle', label: 'Au milieu' }, { id: 'bottom', label: 'En bas' },
  ];

  /** Montant en toutes lettres, suivi d'astérisques pour remplir la ligne. */
  words = computed(() => amountInWords(this.amount() ?? 0));

  /** Montant en chiffres, précédé d'astérisques : « **1 234,56 ». */
  amountText = computed(() => {
    const a = this.amount();
    return a !== null && a > 0 ? '**' + a.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  });

  /** Ce qui manque pour imprimer, ou chaîne vide. */
  hint = computed(() => {
    const a = this.amount();
    if (!this.payee().trim()) return 'Indiquez le bénéficiaire.';
    if (a === null) return 'Indiquez le montant.';
    if (!(a > 0)) return 'Le montant doit être supérieur à 0.';
    if (a >= 1_000_000_000) return 'Le montant est trop élevé.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date())) return 'Indiquez la date.';
    return '';
  });

  /** Haut du chèque sur la feuille, en millimètres. */
  chequeTop = computed(() => ({ top: 0, middle: PART_MM, bottom: 2 * PART_MM }[this.layout().position]));
  /** Hauts des deux talons (les parties de la feuille qui ne portent pas le chèque). */
  stubTops = computed(() => [0, PART_MM, 2 * PART_MM].filter(t => t !== this.chequeTop()));
  readonly partHeight = PART_MM;

  /** Rappel imprimé sur chaque talon. */
  stubLines = computed(() => [
    `Date : ${this.date()}`,
    `Bénéficiaire : ${this.payee().trim()}`,
    `Montant : ${this.amountText().replace(/^\*+/, '')} $`,
    ...(this.memo().trim() ? [`Objet : ${this.memo().trim()}`] : []),
  ]);

  setAmount(v: number | null): void { this.amount.set(v === null || Number.isNaN(v) ? null : v); }

  setLayout(patch: Partial<ChequeLayout>): void {
    const next = { ...this.layout(), ...patch };
    next.offsetX = this._mm(next.offsetX); next.offsetY = this._mm(next.offsetY);
    this.layout.set(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(next)); } catch { /* stockage indisponible */ }
  }

  setOffset(axis: 'offsetX' | 'offsetY', v: number | null): void { this.setLayout({ [axis]: v ?? 0 }); }

  resetLayout(): void { this.setLayout({ ...DEFAULT_LAYOUT }); }

  clear(): void {
    this.date.set(todayIso()); this.payee.set(''); this.amount.set(null); this.memo.set('');
  }

  /**
   * Imprime seulement la feuille du chèque, sans marge : les règles d'impression sont ajoutées le temps de
   * l'impression puis retirées, pour ne pas toucher à l'impression des autres pages (factures).
   */
  print(): void {
    if (this.hint()) return;
    const style = document.createElement('style');
    style.textContent = `
      @page { size: letter portrait; margin: 0; }
      @media print {
        /* Une seule feuille : le reste de la page, masqué mais toujours là, ferait sortir une 2e feuille avec le chèque en double */
        html, body { margin: 0 !important; padding: 0 !important; background: #fff !important;
                     height: 279mm !important; max-height: 279mm !important; overflow: hidden !important; }
        /* Sans transition : un bouton animé (« transition: all ») resterait visible le temps de son animation */
        body * { visibility: hidden !important; transition: none !important; animation: none !important; }
        .cheque-sheet, .cheque-sheet * { visibility: visible !important; }
        .cheque-sheet { position: fixed !important; left: 0 !important; top: 0 !important; margin: 0 !important;
                        transform: none !important; box-shadow: none !important; border: none !important; background: #fff !important; }
        .cheque-sheet .screen-only { display: none !important; }
      }`;
    document.head.appendChild(style);
    const done = () => { style.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    // Navigateur sans événement « afterprint » : retiré quand même
    setTimeout(done, 60_000);
  }

  private _mm(v: number): number {
    return Number.isFinite(v) ? Math.max(-30, Math.min(30, Math.round(v * 10) / 10)) : 0;
  }

  private _storedLayout(): ChequeLayout {
    try {
      const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
      if (raw && typeof raw === 'object') {
        return {
          position: raw.position === 'middle' || raw.position === 'bottom' ? raw.position : 'top',
          offsetX: this._mm(Number(raw.offsetX)), offsetY: this._mm(Number(raw.offsetY)),
          stubs: raw.stubs !== false, frame: raw.frame === true,
        };
      }
    } catch { /* stockage indisponible ou valeur illisible */ }
    return { ...DEFAULT_LAYOUT };
  }
}
