import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, concatMap, map, toArray } from 'rxjs/operators';
import { httpErrorMessage } from '../../vue/shared/http-error';

export type AttachmentOwner = 'note' | 'communication';

/** Pièce jointe d'une note ou d'une entrée de l'historique de communication. */
export interface AttachmentItem {
  id:         string;
  name:       string;
  size:       number;           // octets
  uploadedAt: string;           // ISO UTC
  uploadedBy: string | null;
}

export interface AttachmentUploadResult {
  uploaded: AttachmentItem[];
  errors:   string[];           // « nom : raison », un par fichier refusé
}

export const ATTACHMENT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx', '.xls', '.xlsx'];
export const ATTACHMENT_MAX_SIZE   = 10 * 1024 * 1024;   // 10 Mo
export const ATTACHMENT_MAX_COUNT  = 10;

@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  constructor(private http: HttpClient) {}

  /** Raison du refus d'un fichier avant envoi (type, taille), ou chaîne vide s'il est acceptable. */
  check(file: File): string {
    const dot = file.name.lastIndexOf('.');
    const ext = dot < 0 ? '' : file.name.slice(dot).toLowerCase();
    if (!ATTACHMENT_EXTENSIONS.includes(ext)) return 'type non autorisé (acceptés : PDF, images JPG / PNG, Word, Excel)';
    if (file.size === 0)                  return 'fichier vide';
    if (file.size > ATTACHMENT_MAX_SIZE)  return 'dépasse 10 Mo';
    return '';
  }

  upload(ownerType: AttachmentOwner, ownerId: string, file: File) {
    const params = new HttpParams().set('ownerType', ownerType).set('ownerId', ownerId);
    const body = new FormData();
    body.append('file', file, file.name);
    return this.http.post<AttachmentItem>('/api/attachments', body, { params });
  }

  /** Envoie les fichiers un par un ; un refus n'arrête pas les suivants. */
  uploadAll(ownerType: AttachmentOwner, ownerId: string, files: File[]): Observable<AttachmentUploadResult> {
    if (files.length === 0) return of({ uploaded: [], errors: [] });
    return from(files).pipe(
      concatMap(f => this.upload(ownerType, ownerId, f).pipe(
        map(item => ({ item, error: '' })),
        catchError(err => of({ item: null as AttachmentItem | null, error: `${f.name} : ${httpErrorMessage(err)}` })),
      )),
      toArray(),
      map(results => ({
        uploaded: results.filter(r => r.item).map(r => r.item as AttachmentItem),
        errors:   results.filter(r => r.error).map(r => r.error),
      })),
    );
  }

  download(id: string) { return this.http.get(`/api/attachments/${id}/download`, { responseType: 'blob' as const }); }
  delete(id: string)   { return this.http.delete<void>(`/api/attachments/${id}`); }
}
