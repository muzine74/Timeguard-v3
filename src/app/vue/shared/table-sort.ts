import { signal } from '@angular/core';

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | boolean | null | undefined;

/**
 * Tri de tableau au clic sur l'en-tête : 1er clic = croissant (ou décroissant pour les
 * colonnes listées dans `descFirst`, ex. montants), 2e clic = sens inverse.
 * L'état est en signaux : utilisable dans un computed() ou un composant OnPush.
 *
 * Gabarit d'en-tête :
 *   <th scope="col" [attr.aria-sort]="sort.aria('ttc')">
 *     <button type="button" class="th-sort" (click)="sort.toggle('ttc')">
 *       Total TTC <span class="th-sort-ind" aria-hidden="true">{{ sort.icon('ttc') }}</span>
 *     </button>
 *   </th>
 */
export class TableSort<K extends string> {
  readonly key = signal<K | null>(null);
  readonly dir = signal<SortDir>('asc');

  constructor(private readonly descFirst: readonly K[] = []) {}

  toggle(k: K): void {
    if (this.key() === k) {
      this.dir.set(this.dir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.key.set(k);
      this.dir.set(this.descFirst.includes(k) ? 'desc' : 'asc');
    }
  }

  aria(k: K): 'ascending' | 'descending' | 'none' {
    return this.key() !== k ? 'none' : this.dir() === 'asc' ? 'ascending' : 'descending';
  }

  icon(k: K): string {
    return this.key() !== k ? '↕' : this.dir() === 'asc' ? '▲' : '▼';
  }

  /** Copie triée (stable) ; sans colonne active, l'ordre d'origine est conservé. Valeurs vides en dernier. */
  apply<T>(rows: readonly T[], value: (row: T, key: K) => SortValue): T[] {
    const k = this.key();
    if (!k) return [...rows];
    const sign = this.dir() === 'asc' ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i, v: value(row, k) }))
      .sort((a, b) => {
        const ea = a.v === null || a.v === undefined || a.v === '';
        const eb = b.v === null || b.v === undefined || b.v === '';
        if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
        const c = compareValues(a.v, b.v);
        return c !== 0 ? c * sign : a.i - b.i;
      })
      .map(x => x.row);
  }
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });

function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}
