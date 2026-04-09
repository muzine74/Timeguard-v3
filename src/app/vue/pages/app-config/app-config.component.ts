import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConfigService, AppConfigDto, ProviderDto,
  AppConfigResponse, emptyConfig, emptyProvider
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

  // Données chargées (référence pour annuler / diff)
  private _saved: AppConfigResponse = { config: emptyConfig(), provider: emptyProvider() };

  // Formulaire courant
  form:     AppConfigDto = emptyConfig();
  provider: ProviderDto  = emptyProvider();

  // Diff calculé avant confirmation
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
        this._saved  = JSON.parse(JSON.stringify(data));
        this.form     = { ...data.config };
        this.provider = data.provider ? { ...data.provider } : emptyProvider();
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

  // ── Annuler : reset vers données sauvegardées ──────────────────────────
  cancel(): void {
    this.form     = { ...this._saved.config };
    this.provider = this._saved.provider ? { ...this._saved.provider } : emptyProvider();
    this.error.set('');
    this.cdr.markForCheck();
  }

  // ── Calculer le diff, ouvrir popup si changements ──────────────────────
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

  // ── Confirmer l'enregistrement ──────────────────────────────────────────
  confirmSave(): void {
    this.showDiff.set(false);
    this.saving.set(true);
    this.svc.save(this.form, this.provider).subscribe({
      next: () => {
        this._saved = JSON.parse(JSON.stringify({ config: this.form, provider: this.provider }));
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

  // ── Diff ────────────────────────────────────────────────────────────────
  private _computeDiff(): DiffEntry[] {
    const entries: DiffEntry[] = [];
    const labels: Record<string, string> = {
      logoPath:        'Logo (chemin)',
      companyName:     'Nom compagnie',
      companyAddress:  'Adresse',
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

    // Provider
    const provLabels: Record<string, string> = {
      name: 'Fournisseur — Nom', mail: 'Fournisseur — Courriel',
      phone: 'Fournisseur — Téléphone', notes: 'Fournisseur — Notes',
    };
    const savedProv = this._saved.provider ?? emptyProvider();
    for (const key of Object.keys(provLabels) as (keyof ProviderDto)[]) {
      const oldVal = String(savedProv[key] ?? '');
      const newVal = String((this.provider as any)[key] ?? '');
      if (oldVal !== newVal)
        entries.push({ label: provLabels[key as string], old: oldVal || '—', new: newVal || '—' });
    }

    return entries;
  }
}
