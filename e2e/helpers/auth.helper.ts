import { Page, expect } from '@playwright/test';
import { ADMIN, EMPLOYEE } from './credentials';

/** Remplit le formulaire de login et attend la redirection post-connexion. */
export async function loginAs(
  page: Page,
  role: 'admin' | 'employee' = 'admin',
): Promise<void> {
  const creds = role === 'admin' ? ADMIN : EMPLOYEE;

  await page.goto('/login');
  await expect(page).toHaveURL(/login/);

  await page.getByLabel(/utilisateur|username/i).fill(creds.username);
  await page.getByLabel(/mot de passe|password/i).fill(creds.password);
  await page.getByRole('button', { name: /connexion|se connecter|login/i }).click();

  // Attendre que le guard homeGuard redirige
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10_000 });
}

/** Vérifie que l'utilisateur est bien redirigé vers la page d'accueil. */
export async function expectLoggedIn(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/login/);
}

/** Déconnexion depuis la navbar. */
export async function logout(page: Page): Promise<void> {
  // Le bouton logout est dans la navbar — chercher par rôle ou texte
  const logoutBtn = page.getByRole('button', { name: /déconnexion|logout/i });
  if (await logoutBtn.isVisible()) {
    await logoutBtn.click();
    await expect(page).toHaveURL(/login/);
  } else {
    // Fallback : vider le localStorage
    await page.evaluate(() => localStorage.clear());
    await page.goto('/login');
  }
}
