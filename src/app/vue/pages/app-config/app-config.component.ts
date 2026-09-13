import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConfigService, AppConfigDto,
  AppConfigResponse, emptyConfig
} from '../../../state/config/config.service';

interface DiffEntry { label: string; old: string; new: string; }

@Component({
  selector: 'app-app-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './app-config.component.html',
  styleUrls: ['./app-config.component.scss'],
})
export class AppConfigComponent implements OnInit {

  loading  = signal(true);
  saving   = signal(false);
  success  = signal('');
  error    = signal('');
  showDiff = signal(false);

  private _saved: AppConfigResponse = { config: emptyConfig() };

  form: AppConfigDto = emptyConfig();

  diff: DiffEntry[] = [];

  constructor(
    private svc: ConfigService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this._load(); }

  private _load(): void {
    this.loading.set(true);
    this.svc.get().subscribe({
      next: data => {
        this._saved = JSON.parse(JSON.stringify(data));
        this.form   = { ...data.config };
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(`Erreur chargement : HTTP ${err.status}`);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  cancel(): void {
    this.form = { ...this._saved.config };
    this.error.set('');
    this.cdr.markForCheck();
  }

  requestSave(): void {
    this.diff = this._computeDiff();
    if (this.diff.length === 0) {
      this.success.set('Aucune modification détectée.');
      setTimeout(() => this.success.set(''), 3000);
      return;
    }
    this.showDiff.set(true);
    this.cdr.markForCheck();
  }

  cancelDiff(): void { this.showDiff.set(false); }

  confirmSave(): void {
    this.showDiff.set(false);
    this.saving.set(true);
    this.svc.save(this.form).subscribe({
      next: () => {
        this._saved = JSON.parse(JSON.stringify({ config: this.form }));
        this.success.set('Configuration enregistrée.');
        this.saving.set(false);
        setTimeout(() => this.success.set(''), 4000);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(err?.error?.message ?? `Erreur HTTP ${err.status}`);
        this.saving.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private _computeDiff(): DiffEntry[] {
    const entries: DiffEntry[] = [];
    const labels: Record<string, string> = {
      logoPath:        'Logo (chemin)',
      companyName:     'Nom compagnie',
      companyAddress:  'Adresse civique',
      companyCity:       'Ville',
      companyProvince:   'Province',
      companyPostalCode: 'Code postal',
      companyCountry:    'Pays',
      payerAccountNumber: 'Numéro de compte de programme du payeur',
      companyPhone:    'Téléphone compagnie',
      companyEmail:    'Courriel compagnie',
      smtpServer:      'Serveur SMTP',
      smtpPort:        'Port SMTP',
      smtpUser:        'Utilisateur SMTP',
      smtpPassword:    'Mot de passe SMTP',
      tpsNumber:       'N° TPS',
      tvqNumber:       'N° TVQ',
      tpsRate:         'Taux TPS',
      tvqRate:         'Taux TVQ',
      bankCoordinates: 'Coordonnées bancaires',
      contactName:     'Nom contact',
      contactPhone:    'Tél. contact',
      contactEmail:    'Courriel contact',
      appVersion:      'Version app',
    };

    for (const key of Object.keys(labels) as (keyof AppConfigDto)[]) {
      const oldVal = String(this._saved.config[key] ?? '');
      const newVal = String((this.form as any)[key] ?? '');
      if (oldVal !== newVal)
        entries.push({ label: labels[key as string], old: oldVal || '—', new: newVal || '—' });
    }

    return entries;
  }
}
