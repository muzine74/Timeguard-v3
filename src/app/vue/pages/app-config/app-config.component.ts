import { Component, OnInit, signal, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConfigService, AppConfigDto,
  AppConfigResponse, emptyConfig
} from '../../../state/config/config.service';
import { TelephonyService, TelephonyConfig } from '../../../state/telephony/telephony.service';
import { MailboxService, MailboxConfig } from '../../../state/mailbox/mailbox.service';
import { httpErrorMessage } from '../../shared/http-error';

const emptyMailbox = (): MailboxConfig => ({
  enabled: false, directoryId: null, clientId: null, clientSecret: null, hasClientSecret: false, mailbox: null,
  importPastDays: 0, lastCheckedAt: null, lastError: null,
});

interface DiffEntry { label: string; old: string; new: string; }

const emptyTelephony = (): TelephonyConfig => ({
  enabled: false, accountSid: null, authToken: null, hasAuthToken: false, apiKeySid: null, apiKeySecret: null,
  hasApiKeySecret: false, twimlAppSid: null, callerNumber: null, publicBaseUrl: null, recordingMode: 'off',
  recordingNotice: null, retentionDays: 0, voiceUrl: null,
});

@Component({
    selector: 'app-app-config',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './app-config.component.html',
    styleUrls: ['./app-config.component.scss']
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

  // ── Téléphonie (Twilio) : enregistrée séparément du reste de la configuration ──
  tel: TelephonyConfig = emptyTelephony();
  telLoaded = signal(false);
  telSaving = signal(false);
  telError  = signal('');
  readonly NOTICE_EXAMPLE = 'Bonjour. Cet appel est enregistré à des fins de qualité et de suivi.';

  // ── Courriels reçus (boîte Microsoft 365) : enregistrés séparément du reste de la configuration ──
  mbx: MailboxConfig = emptyMailbox();
  mbxLoaded   = signal(false);
  mbxSaving   = signal(false);
  mbxChecking = signal(false);
  mbxError    = signal('');
  mbxResult   = signal('');

  constructor(
    private svc: ConfigService,
    private telSvc: TelephonyService,
    private mbxSvc: MailboxService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void { this._load(); this._loadTelephony(); this._loadMailbox(); }

  private _loadMailbox(): void {
    this.mbxSvc.getConfig().subscribe({
      next: cfg => { this.mbx = { ...cfg, importPastDays: 0 }; this.mbxLoaded.set(true); this.cdr.markForCheck(); },
      error: err => { this.mbxError.set(httpErrorMessage(err, `Impossible de charger les courriels reçus`)); this.cdr.markForCheck(); },
    });
  }

  saveMailbox(): void {
    if (this.mbxSaving()) return;
    this.mbxSaving.set(true);
    this.mbxError.set('');
    this.mbxResult.set('');
    this.mbxSvc.saveConfig({ ...this.mbx, importPastDays: Number(this.mbx.importPastDays) || 0 }).subscribe({
      next: cfg => {
        this.mbx = { ...cfg, importPastDays: 0 };          // le secret saisi ne reste pas dans la page
        this.mbxSaving.set(false);
        this.success.set('Courriels reçus : configuration enregistrée.');
        setTimeout(() => this.success.set(''), 4000);
        this.cdr.markForCheck();
      },
      error: err => {
        this.mbxError.set(httpErrorMessage(err, `Enregistrement impossible`));
        this.mbxSaving.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  /** Lit la boîte tout de suite : sert à vérifier que la connexion à Microsoft 365 fonctionne. */
  checkMailbox(): void {
    if (this.mbxChecking()) return;
    this.mbxChecking.set(true);
    this.mbxError.set('');
    this.mbxResult.set('');
    this.mbxSvc.check().subscribe({
      next: r => {
        this.mbxChecking.set(false);
        if (r.error) this.mbxError.set(r.error);
        else this.mbxResult.set(`Lecture réussie : ${r.examined} courriel(s) examiné(s), ${r.added} ajouté(s) à l'historique de communication.`);
        this.mbx = { ...this.mbx, lastCheckedAt: new Date().toISOString(), lastError: r.error || null };
        this.cdr.markForCheck();
      },
      error: err => {
        this.mbxError.set(httpErrorMessage(err, `Lecture impossible`));
        this.mbxChecking.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private _loadTelephony(): void {
    this.telSvc.getConfig().subscribe({
      next: cfg => { this.tel = cfg; this.telLoaded.set(true); this.cdr.markForCheck(); },
      error: err => { this.telError.set(httpErrorMessage(err, `Impossible de charger la téléphonie`)); this.cdr.markForCheck(); },
    });
  }

  /** Adresse à saisir dans Twilio : connue seulement après un premier enregistrement. */
  copyVoiceUrl(): void {
    if (!this.tel.voiceUrl) return;
    navigator.clipboard?.writeText(this.tel.voiceUrl).then(() => {
      this.success.set('Adresse copiée.');
      setTimeout(() => this.success.set(''), 3000);
    }).catch(() => { /* copie refusée par le navigateur : l'adresse reste affichée */ });
  }

  saveTelephony(): void {
    if (this.telSaving()) return;
    this.telSaving.set(true);
    this.telError.set('');
    // L'adresse publique du site est celle que l'administrateur utilise en ce moment : Twilio y enverra ses requêtes
    this.telSvc.saveConfig({ ...this.tel, publicBaseUrl: location.origin }).subscribe({
      next: cfg => {
        this.tel = cfg;                       // les secrets saisis ne restent pas dans la page
        this.telSaving.set(false);
        this.telSvc.loadStatus();
        this.success.set('Téléphonie enregistrée.');
        setTimeout(() => this.success.set(''), 4000);
        this.cdr.markForCheck();
      },
      error: err => {
        this.telError.set(httpErrorMessage(err, `Enregistrement impossible`));
        this.telSaving.set(false);
        this.cdr.markForCheck();
      },
    });
  }

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
        this.error.set(httpErrorMessage(err, `Erreur chargement`));
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
        // Le mot de passe saisi ne reste pas dans la page : il est enregistré côté serveur
        if (this.form.smtpPassword) { this.form.hasSmtpPassword = true; this.form.smtpPassword = null; }
        this._saved = JSON.parse(JSON.stringify({ config: this.form }));
        this.success.set('Configuration enregistrée.');
        this.saving.set(false);
        setTimeout(() => this.success.set(''), 4000);
        this.cdr.markForCheck();
      },
      error: err => {
        this.error.set(httpErrorMessage(err));
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
      if (oldVal === newVal) continue;
      // Mot de passe SMTP : jamais affiché ; champ vide = inchangé (l'API ne le renvoie pas)
      if (key === 'smtpPassword') {
        if (newVal) entries.push({ label: labels[key], old: this.form.hasSmtpPassword ? '••••••' : '—', new: '(nouveau mot de passe)' });
        continue;
      }
      entries.push({ label: labels[key as string], old: oldVal || '—', new: newVal || '—' });
    }

    return entries;
  }
}
