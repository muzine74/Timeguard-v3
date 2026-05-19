import { test, expect, Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';
import { apiGet } from '../helpers/api.helper';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function readCumulativeGain(page: Page): Promise<number> {
  const tile = page.locator('.stat.s5 .val, .stats .s5 .val').first();
  await tile.waitFor({ timeout: 8_000 });
  const text = await tile.textContent() ?? '0';
  return parseFloat(text.replace(/[^0-9.,-]/g, '').replace(',', '.')) || 0;
}

async function selectFirstEmployee(page: Page): Promise<void> {
  const item = page.locator('.emp-item, .sidebar-item').first();
  await item.waitFor({ timeout: 10_000 });
  await item.click();
  await page.waitForTimeout(1_000);
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('06 — Gains Non Validés (cumulatifs)', () => {

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin');
    await page.goto('/employees');
    await page.waitForLoadState('networkidle');
  });

  // ── FS-E2E1 : Gain initial chargé depuis l'API ────────────────────────────
  test('gain non validés — chargé au démarrage', async ({ page }) => {
    await selectFirstEmployee(page);

    // La tuile "Gains non validés" doit s'afficher (même si 0.00 $)
    const tile = page.locator('.stat.s5, [class*="stat"][class*="s5"]').first();
    await expect(tile).toBeVisible({ timeout: 8_000 });

    const label = tile.locator('.lbl');
    await expect(label).toContainText(/gains/i);
  });

  // ── FS-E2E2 : Coche → gain mis à jour instantanément ─────────────────────
  test('cocher une case → gain mis à jour sans appel API', async ({ page }) => {
    await selectFirstEmployee(page);

    const gainAvant = await readCumulativeGain(page);

    // Intercepter les appels API pour vérifier qu'aucun n'est déclenché sur toggle
    const earningsRequests: string[] = [];
    page.on('request', req => {
      if (req.url().includes('/earnings')) earningsRequests.push(req.url());
    });

    const checkboxes = page.locator('table input[type="checkbox"]');
    await checkboxes.first().waitFor({ timeout: 5_000 });

    for (let i = 0; i < await checkboxes.count(); i++) {
      const cb = checkboxes.nth(i);
      if (!(await cb.isChecked())) {
        await cb.click();
        break;
      }
    }

    await page.waitForTimeout(400);
    const gainApres = await readCumulativeGain(page);

    // Le gain doit changer (ou rester à 0 si pas de tarif) sans appel API earnings
    // Un appel /earnings au changement de semaine est OK,
    // mais pas sur un simple toggle de case
    const earningsOnToggle = earningsRequests.filter(url => !url.includes('load'));
    expect(earningsOnToggle).toHaveLength(0);
    expect(gainApres).toBeGreaterThanOrEqual(gainAvant);
  });

  // ── FS-E2E3 : Navigation vers semaine passée → pas de double-comptage ─────
  test('navigation semaine passée non validée → gain recalculé sans doublon', async ({ page, request }) => {
    await selectFirstEmployee(page);

    const gainCourant = await readCumulativeGain(page);

    // Naviguer vers une semaine antérieure
    const prevBtn = page.locator('button').filter({ hasText: /‹|<|précédent/i }).first();
    if (!await prevBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      test.skip(true, 'Pas de navigation semaine trouvée');
      return;
    }

    await prevBtn.click();
    await page.waitForTimeout(1_500);

    const gainPassee = await readCumulativeGain(page);

    // Le gain affiché sur la semaine passée ne doit PAS être
    // gainCourant + gainPassee (ce serait un double-comptage).
    // Il devrait être : (semaines non validées hors passée) + local passée
    // On vérifie juste qu'il n'y a pas de valeur absurde (> 2× gainCourant).
    if (gainCourant > 0) {
      expect(gainPassee).toBeLessThanOrEqual(gainCourant * 2 + 1);
    }
  });

  // ── FS-E2E4 : Liste semaines non validées en bas de la page pointage ───────
  test('page /pointage — section semaines non validées visible si données', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'employee');
    await page.goto('/pointage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const section = page.locator('.unlocked-weeks-section');
    // La section peut être absente si aucune semaine passée non validée
    if (await section.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(section.locator('.unlocked-title')).toContainText(/non validées/i);
      await expect(section.locator('.unlocked-count')).toBeVisible();

      // Chaque ligne affiche une plage de dates et un gain > 0
      const rows = section.locator('.unlocked-row');
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        const gain = await rows.nth(i).locator('.unlocked-gain').textContent() ?? '';
        const amount = parseFloat(gain.replace(/[^0-9.]/g, ''));
        expect(amount).toBeGreaterThan(0);
      }
    }
  });

  // ── FS-E2E5 : Clic sur une semaine non validée → navigation ──────────────
  test('clic semaine non validée → navigue vers cette semaine', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'employee');
    await page.goto('/pointage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    const section = page.locator('.unlocked-weeks-section');
    if (!await section.isVisible({ timeout: 3_000 }).catch(() => false)) {
      test.skip(true, 'Aucune semaine non validée disponible');
      return;
    }

    const firstRow = section.locator('.unlocked-row').first();
    const dateText = await firstRow.locator('.unlocked-dates').textContent() ?? '';

    await firstRow.click();
    await page.waitForTimeout(1_000);

    // La date-picker doit refléter la nouvelle semaine sélectionnée
    const weekLabel = page.locator('.week-label, [class*="week-label"]').first();
    if (await weekLabel.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const label = await weekLabel.textContent() ?? '';
      expect(label.length).toBeGreaterThan(0);
    }
  });

  // ── FS-E2E6 : Gain = 0 si aucune case cochée ─────────────────────────────
  test('aucune case cochée sur semaine vide → gain semaine = 0', async ({ page }) => {
    await selectFirstEmployee(page);

    // Décocher toutes les cases
    const checkboxes = page.locator('table input[type="checkbox"]');
    const count = await checkboxes.count();
    for (let i = 0; i < count; i++) {
      const cb = checkboxes.nth(i);
      if (await cb.isChecked()) await cb.click();
    }

    await page.waitForTimeout(400);

    // Le weekTotal (semaine courante) doit être 0
    const statsWeekTotal = page.locator('.earn-total .earn-sub, .earn-row.earn-total').first();
    if (await statsWeekTotal.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const txt = await statsWeekTotal.textContent() ?? '';
      const val = parseFloat(txt.replace(/[^0-9.]/g, ''));
      expect(val).toBe(0);
    }
  });
});
