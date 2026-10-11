/**
 * Message d'erreur lisible pour une requête échouée : ce qui s'est passé et quoi faire.
 *
 *  - le message renvoyé par l'API est repris tel quel quand il est précis (« Le sujet est obligatoire. ») ;
 *  - sinon le code HTTP est traduit en phrase (connexion perdue, session expirée, permission, etc.).
 *
 * `context` (facultatif) dit ce qui a échoué — « Impossible de charger les paiements » — et précède l'explication.
 */

/** Message générique de l'API pour une erreur interne : remplacé par une phrase plus utile. */
const GENERIC_SERVER_MESSAGES = ['Une erreur interne est survenue.', 'Une erreur interne est survenue'];

export function httpErrorMessage(err: any, context?: string): string {
  const status: number | undefined = typeof err?.status === 'number' ? err.status : undefined;

  // 1. Message précis de l'API
  const api = typeof err?.error?.message === 'string' ? err.error.message.trim() : '';
  if (api && !GENERIC_SERVER_MESSAGES.includes(api)) return api;

  // 2. Erreurs de validation ASP.NET ({ errors: { Champ: ['message'] } })
  const validation = firstValidationMessage(err?.error?.errors);
  if (validation) return withContext(context, validation);

  return withContext(context, explain(status));
}

function explain(status: number | undefined): string {
  switch (status) {
    case 0:   return 'Connexion au serveur impossible. Vérifiez votre connexion Internet, puis réessayez.';
    case 400: return 'Les informations envoyées ne sont pas valides. Vérifiez les champs, puis réessayez.';
    case 401: return 'Votre session a expiré. Reconnectez-vous pour continuer.';
    case 403: return 'Vous n\'avez pas la permission d\'effectuer cette action. Demandez l\'accès à votre administrateur.';
    case 404: return 'L\'élément demandé est introuvable. Il a peut-être été supprimé : rechargez la page.';
    case 408:
    case 504: return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
    case 409: return 'Cet élément a été modifié entre-temps. Rechargez la page, puis réessayez.';
    case 410: return 'Cette fonction n\'est plus disponible. Rechargez la page pour utiliser la version à jour.';
    case 413: return 'Le fichier est trop volumineux.';
    case 415: return 'Ce type de fichier n\'est pas accepté.';
    case 429: return 'Trop de tentatives. Patientez un moment avant de réessayer.';
    case 502:
    case 503: return 'Le service est momentanément indisponible (une mise à jour est peut-être en cours). Réessayez dans une minute.';
  }
  if (status !== undefined && status >= 500)
    return 'Une erreur est survenue de notre côté. Réessayez ; si le problème continue, contactez votre administrateur.';
  if (status === undefined)
    return 'Une erreur inattendue est survenue. Rechargez la page, puis réessayez.';
  return `Une erreur inattendue est survenue (code ${status}). Rechargez la page, puis réessayez.`;
}

function withContext(context: string | undefined, message: string): string {
  const c = (context ?? '').trim().replace(/[\s.:—-]+$/, '');
  return c ? `${c}. ${message}` : message;
}

function firstValidationMessage(errors: unknown): string {
  if (!errors || typeof errors !== 'object') return '';
  for (const value of Object.values(errors as Record<string, unknown>)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.trim()) return first.trim();
  }
  return '';
}
