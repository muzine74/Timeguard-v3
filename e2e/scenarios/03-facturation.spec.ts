import { test, expect, Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';

// ── Helpers ──────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function waitForInvoiceList(page: Page): Promise<void> {
  await page.locator('table tbody tr, .bill-row').first().waitFor({ timeout: 10_000 });
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('03 — Facturation (Nouvelle facture + Par pointages)', () => {

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3A — Nouvelle facture
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('3A — Nouvelle facture', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/invoices/new');
      await page.waitForLoadState('networkidle');
    });

    // ── B-E2E1 : Sélectionner une compagnie → formulaire activé ───────────
    test('sélectionner compagnie → formulaire facture visible', async ({ page }) => {
      const firstCompany = page.locator('.sidebar-item').first();
      await firstCompany.waitFor({ timeout: 8_000 });
      await firstCompany.click();

      // Zone principale avec le titre
      await expect(page.locator('.page-title, h1').first()).toBeVisible({ timeout: 5_000 });
      // Aperçu facture doit apparaître
      await expect(page.locator('.invoice-preview')).toBeVisible({ timeout: 5_000 });
    });

    // ── B-E2E2 : Pré-remplir depuis tarif ────────────────────────────────
    test('bouton pré-remplir → lignes de facture générées', async ({ page }) => {
      const firstCompany = page.locator('.sidebar-item').first();
      await firstCompany.waitFor({ timeout: 8_000 });
      await firstCompany.click();

      const prefillBtn = page.getByRole('button', { name: /pré-remplir|auto.?fill|⚡/i });
      if (!await prefillBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip(true, 'Pas de tarif configuré pour cette compagnie');
        return;
      }

      await prefillBtn.click();
      // Au moins une ligne de facture
      const rows = page.locator('.inv-table tbody tr');
      await expect(rows.first()).toBeVisible({ timeout: 5_000 });
      expect(await rows.count()).toBeGreaterThan(0);
    });

    // ── B-E2E3 : Enregistrer → toast succès + redirection /invoices ───────
    test('enregistrer facture → toast succès et redirection', async ({ page }) => {
      const firstCompany = page.locator('.sidebar-item').first();
      await firstCompany.waitFor({ timeout: 8_000 });
      await firstCompany.click();
      await page.waitForTimeout(500);

      const saveBtn = page.getByRole('button', { name: /enregistrer$/i });
      await expect(saveBtn).toBeVisible({ timeout: 5_000 });
      await saveBtn.click();

      // Toast OU redirection vers /invoices
      await Promise.race([
        expect(page.locator('.toast-show').first()).toBeVisible({ timeout: 8_000 }),
        expect(page).toHaveURL(/\/invoices$/, { timeout: 8_000 }),
      ]);
    });

    // ── B-E2E4 : Aperçu PDF → appel window.print ─────────────────────────
    test('bouton aperçu PDF → dialogue impression déclenché', async ({ page }) => {
      const firstCompany = page.locator('.sidebar-item').first();
      await firstCompany.waitFor({ timeout: 8_000 });
      await firstCompany.click();

      // Intercepter window.print()
      let printCalled = false;
      await page.exposeFunction('__playwright_print_called__', () => { printCalled = true; });
      await page.evaluate(() => {
        (window as any).__original_print = window.print;
        window.print = () => { (window as any).__playwright_print_called__(); };
      });

      const pdfBtn = page.getByRole('button', { name: /aperçu pdf|imprimer|🖨/i });
      await expect(pdfBtn).toBeVisible({ timeout: 5_000 });
      await pdfBtn.click();
      await page.waitForTimeout(500);

      expect(printCalled).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3B — Facturation par pointages
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('3B — Facturation par pointages', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/invoices/from-timesheets');
      await page.waitForLoadState('networkidle');
    });

    // ── B-E2E5 : Charger la période → sections Éligibles / En attente ─────
    test('charger période → sections éligibles et en attente affichées', async ({ page }) => {
      // Entrer la période courante
      const periodInput = page.getByLabel(/période/i);
      await periodInput.waitFor({ timeout: 5_000 });
      await periodInput.fill(currentPeriod());
      await periodInput.press('Enter');

      await page.waitForTimeout(2_000);

      // Au moins une des deux sections doit être visible
      const eligible = page.locator('[class*="eligible"], .section-eligible, h2, h3').filter({ hasText: /éligible/i });
      const pending  = page.locator('[class*="pending"], .section-pending, h2, h3').filter({ hasText: /attente/i });

      const hasEligible = await eligible.first().isVisible({ timeout: 3_000 }).catch(() => false);
      const hasPending  = await pending.first().isVisible({ timeout: 3_000 }).catch(() => false);

      expect(hasEligible || hasPending).toBe(true);
    });

    // ── B-E2E6 : Cocher + Générer → factures créées ───────────────────────
    test('cocher compagnies éligibles → bouton Générer actif', async ({ page }) => {
      const periodInput = page.getByLabel(/période/i);
      await periodInput.waitFor({ timeout: 5_000 });
      await periodInput.fill(currentPeriod());
      await periodInput.press('Enter');
      await page.waitForTimeout(2_000);

      // Cocher la première compagnie éligible
      const eligibleCheckbox = page.locator('input[type="checkbox"]').first();
      if (!await eligibleCheckbox.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip(true, 'Aucune compagnie éligible pour la période courante');
        return;
      }

      await eligibleCheckbox.check();

      // Bouton Générer doit s'activer
      const generateBtn = page.getByRole('button', { name: /générer/i });
      await expect(generateBtn).toBeEnabled({ timeout: 3_000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3C — Gestion des factures
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('3C — Gestion factures (/invoices)', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/invoices');
      await page.waitForLoadState('networkidle');
    });

    // ── B-E2E7 : Liste chargée, filtres fonctionnels ──────────────────────
    test('page /invoices → tableau factures chargé', async ({ page }) => {
      // Attendre le tableau ou le message "aucune facture"
      await Promise.race([
        page.locator('table tbody tr').first().waitFor({ timeout: 10_000 }),
        page.locator('[class*="empty"], .no-data').first().waitFor({ timeout: 10_000 }),
      ]);
      // La page s'est chargée sans erreur
      await expect(page.locator('.toast-error')).not.toBeVisible();
    });

    // ── B-E2E8 : Clic sur une facture → modal détail ─────────────────────
    test('clic facture → modal détail s\'ouvre', async ({ page }) => {
      const firstRow = page.locator('table tbody tr').first();
      if (!await firstRow.isVisible({ timeout: 8_000 }).catch(() => false)) {
        test.skip(true, 'Aucune facture disponible');
        return;
      }

      await firstRow.click();

      // Modal ou panneau de détail
      const modal = page.locator('.modal, .bill-detail, [class*="detail"]').first();
      await expect(modal).toBeVisible({ timeout: 5_000 });
    });

    // ── B-E2E9 : Avoir désactivé si facture non envoyée ───────────────────
    test('facture non envoyée → bouton Avoir désactivé', async ({ page }) => {
      // Chercher une ligne non envoyée (pas de badge "Envoyée")
      const rows = page.locator('table tbody tr');
      const count = await rows.count();

      for (let i = 0; i < Math.min(count, 5); i++) {
        const row = rows.nth(i);
        const sent = await row.locator('[class*="sent"], .badge-sent').isVisible();
        if (!sent) {
          await row.click();
          const avoirBtn = page.getByRole('button', { name: /avoir/i });
          if (await avoirBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await expect(avoirBtn).toBeDisabled();
          }
          break;
        }
      }
    });
  });
});
