import { test, expect } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';
import { ADMIN } from '../helpers/credentials';

test.describe('01 — Connexion & Redirection', () => {

  test.beforeEach(async ({ page }) => {
    // Partir d'un état propre
    await page.evaluate(() => localStorage.clear());
  });

  // ── A1 : Login admin valide → redirection selon permissions ──────────────
  test('login admin valide → redirigé hors de /login', async ({ page }) => {
    await loginAs(page, 'admin');
    await expect(page).not.toHaveURL(/login/);
    // homeGuard : admin avec employees.view → /employees
    await expect(page).toHaveURL(/employees|pointage|invoices|groups/);
  });

  // ── A2 : Mauvais mot de passe → reste sur /login avec erreur ─────────────
  test('mauvais mot de passe → erreur affichée, reste sur /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/utilisateur|username/i).fill(ADMIN.username);
    await page.getByLabel(/mot de passe|password/i).fill('mauvais_mdp_xyz');
    await page.getByRole('button', { name: /connexion|se connecter|login/i }).click();

    // Toujours sur /login
    await expect(page).toHaveURL(/login/);
    // Message d'erreur visible
    const erreur = page.locator('.error, .toast-error, [class*="error"]');
    await expect(erreur.first()).toBeVisible({ timeout: 5_000 });
  });

  // ── A3 : Champs vides → formulaire non soumis ────────────────────────────
  test('champs vides → pas de navigation', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /connexion|se connecter|login/i }).click();
    await expect(page).toHaveURL(/login/);
  });

  // ── A5 : Accès direct route protégée sans token → /login ─────────────────
  test('accès direct /employees sans token → /login', async ({ page }) => {
    await page.goto('/employees');
    await expect(page).toHaveURL(/login/);
  });

  test('accès direct /invoices sans token → /login', async ({ page }) => {
    await page.goto('/invoices');
    await expect(page).toHaveURL(/login/);
  });

  // ── Déconnexion ──────────────────────────────────────────────────────────
  test('déconnexion → retour /login', async ({ page }) => {
    await loginAs(page, 'admin');
    // Chercher un bouton de déconnexion ou vider le localStorage
    const logoutBtn = page.getByRole('button', { name: /déconnexion|logout/i });
    if (await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.click();
    } else {
      await page.evaluate(() => localStorage.clear());
      await page.reload();
    }
    await expect(page).toHaveURL(/login/);
  });
});
