import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Call, Device } from '@twilio/voice-sdk';
import { httpErrorMessage } from '../../vue/shared/http-error';

export type CallTargetType = 'company' | 'employee';

/** Téléphonie de l'entreprise (Administration → Configuration → Téléphonie). */
export interface TelephonyConfig {
  enabled:         boolean;
  accountSid:      string | null;
  authToken:       string | null;     // écriture seule : jamais renvoyé par l'API
  hasAuthToken:    boolean;
  apiKeySid:       string | null;
  apiKeySecret:    string | null;     // écriture seule : jamais renvoyé par l'API
  hasApiKeySecret: boolean;
  twimlAppSid:     string | null;
  callerNumber:    string | null;
  publicBaseUrl:   string | null;
  recordingMode:   'off' | 'all';
  recordingNotice: string | null;
  retentionDays:   number;
  voiceUrl:        string | null;     // lecture seule : « Voice URL » à saisir dans Twilio
}

/** Ce que l'utilisateur connecté peut faire avec la téléphonie. */
export interface TelephonyStatus {
  enabled:   boolean;                 // activée et entièrement configurée
  canCall:   boolean;
  canListen: boolean;
  recording: boolean;                 // les appels sont enregistrés
}

export interface CallNumber { label: string; number: string; }

export type CallState = 'starting' | 'ringing' | 'open' | 'ended';

/** Appel en cours (ou tout juste terminé), affiché dans la barre d'appel. */
export interface ActiveCall {
  callId:     string | null;          // entrée d'historique ; null tant qu'elle n'est pas créée
  targetType: CallTargetType;
  targetId:   string;
  label:      string;                 // personne ou numéro appelé
  number:     string;
  state:      CallState;
  seconds:    number;                 // durée depuis la mise en relation
  muted:      boolean;
  error:      string;                 // raison de l'échec, sinon vide
}

/** Appels passés depuis le navigateur (Twilio Voice) : un seul appel à la fois. */
@Injectable({ providedIn: 'root' })
export class TelephonyService {
  readonly status = signal<TelephonyStatus | null>(null);
  readonly call   = signal<ActiveCall | null>(null);
  /** Dernier appel terminé : les pages qui affichent l'historique s'en servent pour le recharger. */
  readonly lastEnded = signal<{ targetType: CallTargetType; targetId: string; at: number } | null>(null);

  private _device: Device | null = null;
  private _call:   Call | null = null;
  private _timer:  ReturnType<typeof setInterval> | null = null;
  private _clear:  ReturnType<typeof setTimeout> | null = null;

  constructor(private http: HttpClient) {}

  // ── Configuration ──────────────────────────────────────
  getConfig()                      { return this.http.get<TelephonyConfig>('/api/telephony/config'); }
  saveConfig(cfg: TelephonyConfig) { return this.http.put<TelephonyConfig>('/api/telephony/config', cfg); }

  /** Charge ce que l'utilisateur peut faire (sans effet si la requête échoue : pas de bouton d'appel). */
  loadStatus(): void {
    this.http.get<TelephonyStatus>('/api/telephony/status').subscribe({
      next: s => this.status.set(s),
      error: () => this.status.set(null),
    });
  }

  getNumbers(targetType: CallTargetType, targetId: string) {
    const params = new HttpParams().set('targetType', targetType).set('targetId', targetId);
    return this.http.get<CallNumber[]>('/api/telephony/numbers', { params });
  }

  /** Enregistrement d'un appel (l'écoute est tracée côté serveur). */
  getRecording(callId: string) {
    return this.http.get(`/api/telephony/calls/${callId}/recording`, { responseType: 'blob' });
  }

  // ── Appel ──────────────────────────────────────────────
  /** Lance un appel. Renvoie un message d'erreur, ou une chaîne vide si l'appel est parti. */
  async start(targetType: CallTargetType, targetId: string, number: string, contact: string): Promise<string> {
    if (this.call() && this.call()!.state !== 'ended') return 'Un appel est déjà en cours.';
    if (this._clear) { clearTimeout(this._clear); this._clear = null; }

    this.call.set({ callId: null, targetType, targetId, label: contact || number, number, state: 'starting', seconds: 0, muted: false, error: '' });
    let callId: string | null = null;
    try {
      const started = await firstValueFrom(this.http.post<{ callId: string; number: string }>(
        '/api/telephony/calls', { targetType, targetId, number, contact }));
      callId = started.callId;
      this._patch({ callId, number: started.number, label: contact || started.number });

      const { token } = await firstValueFrom(this.http.post<{ token: string }>('/api/telephony/token', {}));
      // Chargé seulement au premier appel : le SDK ne pèse pas sur le démarrage de l'application
      const { Device } = await import('@twilio/voice-sdk');
      this._device = new Device(token, { closeProtection: true });
      this._device.on('error', (e: unknown) => this._end(this._explain(e)));

      const call = await this._device.connect({ params: { callId } });
      this._call = call;
      call.on('ringing',    () => this._patch({ state: 'ringing' }));
      call.on('accept',     () => this._onAccept());
      call.on('disconnect', () => this._end(''));
      call.on('cancel',     () => this._end(''));
      call.on('reject',     () => this._end('L\'appel a été refusé.'));
      call.on('error',      (e: unknown) => this._end(this._explain(e)));
      return '';
    } catch (e) {
      const message = this._explain(e);
      this._end(message);
      return message;
    }
  }

  hangUp(): void {
    if (this._call) this._call.disconnect();
    else this._end('');
  }

  toggleMute(): void {
    const c = this.call();
    if (!c || !this._call || c.state === 'ended') return;
    this._call.mute(!c.muted);
    this._patch({ muted: !c.muted });
  }

  /** Touche du clavier téléphonique (menus vocaux). */
  sendDigit(digit: string): void {
    if (this._call && this.call()?.state === 'open' && /^[0-9*#]$/.test(digit)) this._call.sendDigits(digit);
  }

  /** Ferme la barre d'un appel terminé. */
  dismiss(): void {
    if (this.call()?.state === 'ended') this.call.set(null);
  }

  private _onAccept(): void {
    this._patch({ state: 'open', seconds: 0 });
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => {
      const c = this.call();
      if (c?.state === 'open') this.call.set({ ...c, seconds: c.seconds + 1 });
    }, 1000);
  }

  private _end(error: string): void {
    const c = this.call();
    if (!c || c.state === 'ended') return;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    try { this._device?.destroy(); } catch { /* déjà fermé */ }
    this._device = null;
    this._call = null;
    this.call.set({ ...c, state: 'ended', muted: false, error });
    // Appel jamais mis en relation (micro absent, refus de Twilio…) : son entrée passe à « Annulé ».
    // Sans effet si Twilio a déjà pris l'appel en charge.
    if (c.callId && c.state !== 'open') this.http.post(`/api/telephony/calls/${c.callId}/abandon`, {}).subscribe({ error: () => {} });
    if (c.callId) this.lastEnded.set({ targetType: c.targetType, targetId: c.targetId, at: Date.now() });
    // Un appel terminé normalement quitte l'écran tout seul ; une erreur reste jusqu'à sa fermeture
    if (!error) this._clear = setTimeout(() => this.dismiss(), 5000);
  }

  private _patch(change: Partial<ActiveCall>): void {
    const c = this.call();
    if (c && c.state !== 'ended') this.call.set({ ...c, ...change });
  }

  private _explain(e: any): string {
    if (typeof e?.status === 'number') return httpErrorMessage(e, 'Appel impossible');
    const name = e?.name ?? e?.originalError?.name ?? '';
    const code = e?.code ?? 0;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || code === 31401 || code === 31208)
      return 'Appel impossible. Le micro est bloqué : autorisez-le pour ce site dans votre navigateur, puis réessayez.';
    if (name === 'NotFoundError' || code === 31402)
      return 'Appel impossible. Aucun micro n\'a été trouvé : branchez un casque ou un micro, puis réessayez.';
    if (code === 20101 || code === 20104 || code === 31204 || code === 31205)
      return 'Appel impossible. Le compte Twilio a refusé la connexion : vérifiez la clé d\'API et l\'application TwiML dans la Configuration.';
    if (code === 31005 || code === 31009 || code === 53000 || code === 53405)
      return 'L\'appel a été coupé. Vérifiez votre connexion Internet, puis réessayez.';
    return 'Appel impossible. Réessayez ; si le problème continue, contactez votre administrateur.';
  }
}
