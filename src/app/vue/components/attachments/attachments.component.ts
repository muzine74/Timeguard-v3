import { Component, ChangeDetectionStrategy, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AttachmentsService, AttachmentItem, AttachmentOwner, ATTACHMENT_EXTENSIONS, ATTACHMENT_MAX_COUNT,
} from '../../../state/attachments/attachments.service';
import { downloadBlob } from '../../shared/download';

/**
 * Pièces jointes d'une note ou d'une communication.
 *  - ownerId renseigné : liste des fichiers (téléchargement, retrait) et envoi immédiat des fichiers choisis ;
 *  - ownerId vide (élément pas encore créé) : les fichiers choisis sont gardés dans `pending`,
 *    le parent les envoie après la création (AttachmentsService.uploadAll).
 */
@Component({
    selector: 'app-attachments',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule],
    templateUrl: './attachments.component.html',
    styleUrls: ['./attachments.component.scss']
})
export class AttachmentsComponent {
  @Input({ required: true }) ownerType!: AttachmentOwner;
  @Input() ownerId: string | null = null;
  @Input() attachments: AttachmentItem[] = [];
  @Input() canEdit = false;
  @Input() disabled = false;
  @Output() attachmentsChange = new EventEmitter<AttachmentItem[]>();

  @Input() pending: File[] = [];
  @Output() pendingChange = new EventEmitter<File[]>();

  readonly accept = ATTACHMENT_EXTENSIONS.join(',');
  busy   = signal(false);
  errors = signal<string[]>([]);

  constructor(private svc: AttachmentsService) {}

  get total(): number { return this.attachments.length + this.pending.length; }
  get canAdd(): boolean { return this.canEdit && this.total < ATTACHMENT_MAX_COUNT; }

  onPick(input: HTMLInputElement): void {
    const picked = Array.from(input.files ?? []);
    input.value = '';                       // permet de rechoisir le même fichier
    if (picked.length === 0) return;

    const errors: string[] = [];
    const accepted: File[] = [];
    for (const f of picked) {
      const reason = this.svc.check(f);
      if (reason) { errors.push(`${f.name} : ${reason}`); continue; }
      if (this.total + accepted.length >= ATTACHMENT_MAX_COUNT) { errors.push(`${f.name} : maximum de ${ATTACHMENT_MAX_COUNT} pièces jointes atteint`); continue; }
      accepted.push(f);
    }
    this.errors.set(errors);
    if (accepted.length === 0) return;

    if (!this.ownerId) {                    // élément pas encore créé : en attente
      this.pendingChange.emit([...this.pending, ...accepted]);
      return;
    }
    this.busy.set(true);
    this.svc.uploadAll(this.ownerType, this.ownerId, accepted).subscribe(res => {
      this.busy.set(false);
      this.errors.set([...errors, ...res.errors]);
      if (res.uploaded.length) this.attachmentsChange.emit([...this.attachments, ...res.uploaded]);
    });
  }

  removePending(file: File): void {
    this.pendingChange.emit(this.pending.filter(f => f !== file));
  }

  download(a: AttachmentItem): void {
    this.svc.download(a.id).subscribe({
      next: blob => downloadBlob(blob, a.name),
      error: err => this.errors.set([`${a.name} : ${err?.status === 404 ? 'fichier introuvable' : `téléchargement impossible (HTTP ${err?.status ?? '?'})`}`]),
    });
  }

  remove(a: AttachmentItem): void {
    if (this.busy() || !confirm(`Retirer la pièce jointe « ${a.name} » ?`)) return;
    this.busy.set(true);
    this.svc.delete(a.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.errors.set([]);
        this.attachmentsChange.emit(this.attachments.filter(x => x.id !== a.id));
      },
      error: err => {
        this.busy.set(false);
        this.errors.set([`${a.name} : ${err?.error?.message ?? `retrait impossible (HTTP ${err?.status ?? '?'})`}`]);
      },
    });
  }

  size(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  }

  trackItem(_: number, a: AttachmentItem): string { return a.id; }
}
