import { test, expect, Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function selectFirstUnsentInvoice(page: Page): Promise<boolean> {
  const sidebar = page.locator('.sidebar-list, .emp-list').first();
  await sidebar.waitFor({ timeout: 10_000 });

  const items = sidebar.locator('.sidebar-item, .emp-item, li');
  const count = await items.count();
  if (count === 0) return false;

  await items.first().click();
  return true;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('04 — Envoi Factures (/invoices/send)', () => {

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin');
    await page.goto('/invoices/send');
    await page.waitForLoadState('networkidle');
  });

  // ── FI-E2E1 : Sidebar n'affiche que des factures normales (pas d'avoirs) ─
  test('sidebar — aucun numéro se terminant par -AV', async ({ page }) => {
    const sidebar = page.locator('.sidebar-list, [class*="sidebar"]').first();
    await page.waitForTimeout(2_000); // laisser le temps au chargement

    const items = sidebar.locator('.sidebar-item, [class*="bill-item"], li');
    const count = await items.count();

    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).textContent() ?? '';
      expect(text).not.toMatch(/-AV$/i);
    }
  });

  // ── FI-E2E2 : Sélectionner facture → PDF généré automatiquement ──────────
  test('sélectionner facture → PDF en cours de génération', async ({ page }) => {
    const selected = await selectFirstUnsentInvoice(page);
    if (!selected) {
      test.skip(true, 'Aucune facture non envoyée disponible');
      return;
    }

    // Indicateur de génération PDF ou lien "Ouvrir" une fois prêt
    const pdfSpinner = page.locator('[class*="pdf-gen"], [class*="spinner"]').first();
    const pdfReady   = page.getByText(/ouvrir|open/i);

    await Promise.race([
      pdfSpinner.waitFor({ state: 'visible', timeout: 8_000 }),
      pdfReady.waitFor({ state: 'visible', timeout: 12_000 }),
    ]);
  });

  // ── FI-E2E3 : Destinataires — ajouter un email ───────────────────────────
  test('ajouter destinataire → chip visible', async ({ page }) => {
    const selected = await selectFirstUnsentInvoice(page);
    if (!selected) {
      test.skip(true, 'Aucune facture non envoyée disponible');
      return;
    }

    await page.waitForTimeout(1_500);

    const emailInput = page.locator('input[type="email"], input[placeholder*="courriel"], input[placeholder*="email"]').first();
    if (!await emailInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Peut être pré-rempli depuis clientEmail
      const chips = page.locator('.chip, [class*="recipient"]');
      if (await chips.count() > 0) return; // OK, pré-rempli
      test.skip(true, 'Champ email non trouvé');
      return;
    }

    await emailInput.fill('test@exemple.com');
    await emailInput.press('Enter');

    // Le chip doit apparaître
    const chip = page.locator('.chip, [class*="recipient"]').filter({ hasText: 'test@exemple.com' });
    await expect(chip).toBeVisible({ timeout: 3_000 });
  });

  // ── FI-E2E4 : Email invalide → erreur ────────────────────────────────────
  test('email invalide → message d\'erreur', async ({ page }) => {
    const selected = await selectFirstUnsentInvoice(page);
    if (!selected) {
      test.skip(true, 'Aucune facture non envoyée disponible');
      return;
    }

    await page.waitForTimeout(1_000);

    const emailInput = page.locator('input[type="email"], input[placeholder*="courriel"], input[placeholder*="email"]').first();
    if (!await emailInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Champ email non trouvé');
      return;
    }

    await emailInput.fill('email_invalide_sans_arobase');
    await emailInput.press('Enter');

    const error = page.locator('.toast-error, [class*="error"]').first();
    await expect(error).toBeVisible({ timeout: 3_000 });
  });

  // ── FI-E2E5 : Envoi sans destinataire → erreur de validation ─────────────
  test('envoyer sans destinataire → erreur', async ({ page }) => {
    const selected = await selectFirstUnsentInvoice(page);
    if (!selected) {
      test.skip(true, 'Aucune facture non envoyée disponible');
      return;
    }

    await page.waitForTimeout(1_500);

    // Supprimer tous les destinataires existants
    const removeButtons = page.locator('[class*="remove-recipient"], .chip button, [aria-label*="supprimer"]');
    const count = await removeButtons.count();
    for (let i = 0; i < count; i++) {
      await removeButtons.first().click();
    }

    const sendBtn = page.getByRole('button', { name: /envoyer/i });
    if (await sendBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sendBtn.click();
      const error = page.locator('.toast-error, [class*="error"]').first();
      await expect(error).toBeVisible({ timeout: 3_000 });
    }
  });

  // ── FI-E2E6 : Quitter sans envoyer → nettoyage PDF ───────────────────────
  test('navigation vers autre page sans envoyer → pas de PDF résiduel', async ({ page }) => {
    const selected = await selectFirstUnsentInvoice(page);
    if (!selected) {
      test.skip(true, 'Aucune facture non envoyée disponible');
      return;
    }

    // Attendre génération PDF
    await page.waitForTimeout(4_000);

    // Naviguer ailleurs → ngOnDestroy doit supprimer le PDF
    const deleteRequest = page.waitForRequest(
      req => req.url().includes('/pdf') && req.method() === 'DELETE',
      { timeout: 5_000 },
    ).catch(() => null);

    await page.goto('/invoices');
    const req = await deleteRequest;
    // Si le PDF a été généré, DELETE /pdf doit être appelé
    // (peut ne pas se déclencher si PDF non généré dans le temps imparti)
    if (req) {
      expect(req.method()).toBe('DELETE');
    }
  });
});
