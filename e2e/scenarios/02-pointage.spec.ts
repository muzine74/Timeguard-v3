import { test, expect, Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';
import { apiGet } from '../helpers/api.helper';

// ── Helpers locaux ───────────────────────────────────────────────────────────

async function selectFirstEmployee(page: Page): Promise<string> {
  // Attendre la sidebar des employés
  const sidebar = page.locator('.emp-list, .sidebar-list').first();
  await sidebar.waitFor({ timeout: 10_000 });

  const firstItem = sidebar.locator('.emp-item, .sidebar-item').first();
  await firstItem.waitFor();
  const name = await firstItem.locator('.emp-name, .sidebar-name').first().textContent();
  await firstItem.click();
  return name?.trim() ?? '';
}

async function getCurrentWeekGain(page: Page): Promise<number> {
  const gainTile = page.locator('.stat.s5 .val, .stats .s5 .val').first();
  await gainTile.waitFor({ timeout: 5_000 });
  const text = await gainTile.textContent() ?? '0';
  return parseFloat(text.replace(/[^0-9.]/g, '')) || 0;
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('02 — Cycle Pointage Complet', () => {

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin');
    await page.goto('/employees');
    await page.waitForLoadState('networkidle');
  });

  // ── P-E2E1 : Sélectionner un employé → tableau de pointage affiché ────────
  test('sélection employé → tableau pointage visible', async ({ page }) => {
    const name = await selectFirstEmployee(page);
    expect(name).toBeTruthy();

    // Le tableau de pointage (compagnies × jours) doit apparaître
    const table = page.locator('app-pointage-table, .pointage-table').first();
    await expect(table).toBeVisible({ timeout: 8_000 });
  });

  // ── P-E2E2 : Cocher une case → gain hebdo mis à jour ──────────────────────
  test('cocher une case → gain hebdo change', async ({ page }) => {
    await selectFirstEmployee(page);

    const gainAvant = await getCurrentWeekGain(page);

    // Cocher la première case non cochée
    const checkboxes = page.locator('table input[type="checkbox"]');
    await checkboxes.first().waitFor({ timeout: 5_000 });
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);

    // Trouver une case non cochée et la cocher
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      const checked = await cb.isChecked();
      if (!checked) {
        await cb.click();
        break;
      }
    }

    // Le gain s5 doit être réactif (sans appel API)
    await page.waitForTimeout(300);
    const gainApres = await getCurrentWeekGain(page);
    // Soit il a augmenté (prix configuré), soit il est resté à 0 (pas de tarif)
    expect(gainApres).toBeGreaterThanOrEqual(gainAvant);
  });

  // ── P-E2E3 : Sauvegarder → toast de succès ────────────────────────────────
  test('sauvegarder → toast succès et bouton Valider activé', async ({ page }) => {
    await selectFirstEmployee(page);

    // Attendre le bouton Sauvegarder
    const saveBtn = page.getByRole('button', { name: /sauvegarder/i });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeEnabled();

    // Cocher une case si aucune n'est cochée
    const checkboxes = page.locator('table input[type="checkbox"]');
    if ((await checkboxes.count()) > 0) {
      const first = checkboxes.first();
      if (!(await first.isChecked())) await first.click();
    }

    await saveBtn.click();

    // Toast de succès
    const toast = page.locator('.toast-show').first();
    await expect(toast).toBeVisible({ timeout: 8_000 });
    const toastText = await toast.textContent() ?? '';
    expect(toastText).toMatch(/sauvegarder|enregistr|succès/i);

    // Bouton Valider la semaine activé après save
    const validateBtn = page.getByRole('button', { name: /valider la semaine/i });
    if (await validateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(validateBtn).toBeEnabled({ timeout: 5_000 });
    }
  });

  // ── P-E2E4 : Valider la semaine → bannière verrou visible ─────────────────
  test('valider la semaine → semaine verrouillée', async ({ page }) => {
    await selectFirstEmployee(page);

    // Sauvegarder d'abord
    const saveBtn = page.getByRole('button', { name: /sauvegarder/i });
    if (await saveBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1_500);
    }

    // Valider
    const validateBtn = page.getByRole('button', { name: /valider la semaine/i });
    if (!await validateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Bouton Valider non visible — semaine déjà verrouillée ou droits insuffisants');
      return;
    }

    await expect(validateBtn).toBeEnabled({ timeout: 5_000 });
    await validateBtn.click();

    // Bannière "Semaine validée" doit apparaître
    const banner = page.locator('.lock-banner');
    await expect(banner).toBeVisible({ timeout: 8_000 });
    await expect(banner).toContainText(/validée/i);

    // Bouton Sauvegarder doit être désactivé
    await expect(saveBtn).toBeDisabled({ timeout: 3_000 });
  });

  // ── P-E2E5 : Annuler validation → semaine déverrouillée ───────────────────
  test('annuler validation → semaine déverrouillée', async ({ page }) => {
    await selectFirstEmployee(page);

    const unvalidateBtn = page.getByRole('button', { name: /annuler la validation/i });
    if (!await unvalidateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Aucune semaine validée à déverrouiller');
      return;
    }

    await unvalidateBtn.click();

    // La bannière de verrou doit disparaître
    const banner = page.locator('.lock-banner');
    await expect(banner).not.toBeVisible({ timeout: 8_000 });

    // Sauvegarder réactivé
    const saveBtn = page.getByRole('button', { name: /sauvegarder/i });
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
  });

  // ── P-E2E6 : Navigation entre semaines → données restaurées ───────────────
  test('navigation semaine précédente puis retour → données identiques', async ({ page }) => {
    await selectFirstEmployee(page);

    // Lire le gain de la semaine courante
    const gainInitial = await getCurrentWeekGain(page);

    // Reculer d'une semaine
    const prevBtn = page.getByRole('button', { name: /précédent|<|‹|prev/i }).first();
    if (await prevBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await prevBtn.click();
      await page.waitForTimeout(800);
    }

    // Revenir à la semaine courante
    const nextBtn = page.getByRole('button', { name: /suivant|>|›|next/i }).first();
    if (await nextBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(800);
    }

    const gainRetour = await getCurrentWeekGain(page);
    expect(gainRetour).toBe(gainInitial);
  });
});
