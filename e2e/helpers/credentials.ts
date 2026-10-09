/**
 * Toutes les URLs et identifiants sont résolus depuis les variables d'environnement.
 * Configurer via :
 *   - Fichier .env.remote   (valeurs production)
 *   - Fichier .env.local    (surcharge locale — ne pas committer)
 *   - Variables PowerShell  ($env:TEST_ADMIN_USER = "...")
 */

export const APP_URL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

/**
 * URL directe de l'API (sans passer par le proxy Angular).
 * En local dev  : https://localhost:56537
 * En production : http://timeguards.net  (l'API est servie sur le même domaine via IIS)
 *                 OU http://timeguards.net:PORT si port dédié
 */
export const API_URL = process.env['E2E_API_URL'] ?? 'https://localhost:56537';

export const ADMIN = {
  username: process.env['TEST_ADMIN_USER'] ?? '',
  password: process.env['TEST_ADMIN_PASS'] ?? '',
};

export const EMPLOYEE = {
  username: process.env['TEST_EMP_USER'] ?? '',
  password: process.env['TEST_EMP_PASS'] ?? '',
};
