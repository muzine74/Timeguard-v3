import { APIRequestContext } from '@playwright/test';
import { ADMIN, API_URL } from './credentials';

let _token: string | null = null;

/**
 * Résout le chemin complet d'un endpoint API.
 *
 * En local dev, l'API écoute sur https://localhost:56537 (port direct).
 * En production, l'API est accessible via http://timeguards.net/api/...
 * Le préfixe /api est ajouté uniquement si E2E_API_URL ne se termine pas par /api.
 */
function apiEndpoint(path: string): string {
  const base = API_URL.replace(/\/$/, '');
  // Si le chemin inclut déjà /api ou si la base se termine par /api → ne pas doubler
  if (path.startsWith('/api') || base.endsWith('/api')) {
    return `${base}${path.startsWith('/') ? path : '/' + path}`;
  }
  return `${base}/api${path.startsWith('/') ? path : '/' + path}`;
}

/** Obtient un token JWT admin via l'API (mis en cache dans la session de test). */
export async function getAdminToken(request: APIRequestContext): Promise<string> {
  if (_token) return _token;

  const url = apiEndpoint('/auth/login');
  const res  = await request.post(url, {
    data: { username: ADMIN.username, password: ADMIN.password },
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok()) {
    throw new Error(
      `Login API échoué (${res.status()}) sur ${url}\n` +
      `Vérifier TEST_ADMIN_USER / TEST_ADMIN_PASS et E2E_API_URL`,
    );
  }

  const body = await res.json();
  _token = body.token as string;
  return _token;
}

/** Réinitialise le cache token entre suites si nécessaire. */
export function resetTokenCache(): void { _token = null; }

/** GET authentifié sur l'API. */
export async function apiGet(request: APIRequestContext, path: string): Promise<any> {
  const token = await getAdminToken(request);
  const res   = await request.get(apiEndpoint(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`GET ${path} → ${res.status()}`);
  return res.json();
}

/** POST authentifié sur l'API. */
export async function apiPost(
  request: APIRequestContext,
  path: string,
  body: unknown,
): Promise<any> {
  const token = await getAdminToken(request);
  const res   = await request.post(apiEndpoint(path), {
    data:    body,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok()) throw new Error(`POST ${path} → ${res.status()}`);
  return res.json();
}

/** DELETE authentifié sur l'API. */
export async function apiDelete(request: APIRequestContext, path: string): Promise<void> {
  const token = await getAdminToken(request);
  const res   = await request.delete(apiEndpoint(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok()) throw new Error(`DELETE ${path} → ${res.status()}`);
}
