import { Pipe, PipeTransform } from '@angular/core';

/**
 * Initiales d'un nom pour les avatars : « Alice Martin » → « AM », nom vide → « ? ».
 * Remplace les méthodes initials() recopiées dans plusieurs pages.
 */
@Pipe({ name: 'initials', standalone: true })
export class InitialsPipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    const parts = (name ?? '').trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  }
}
