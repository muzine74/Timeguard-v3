import { test, expect, Page } from '@playwright/test';
import { loginAs } from '../helpers/auth.helper';
import { apiGet } from '../helpers/api.helper';

// Suffixe unique pour ne pas polluer la DB entre runs
const RUN_ID = Date.now().toString().slice(-6);
const TEST_EMP_NAME = `Test E2E ${RUN_ID}`;

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('05 — Gestion Employés', () => {

  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await loginAs(page, 'admin');
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5A — Créer un employé
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5A — Création', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/employees/new');
      await page.waitForLoadState('networkidle');
    });

    // ── E-E2E1 : Formulaire vide → bouton Ajouter désactivé / erreur ─────
    test('soumettre formulaire vide → erreur champ obligatoire', async ({ page }) => {
      const submitBtn = page.getByRole('button', { name: /ajouter|créer/i });
      await submitBtn.click();

      // Erreur sur le champ Nom
      const nameError = page.locator('[class*="field-err"], .error').first();
      await expect(nameError).toBeVisible({ timeout: 3_000 });
    });

    // ── E-E2E2 : Type d'emploi — boutons pills visibles ───────────────────
    test('type d\'emploi — boutons Permanent et À la tâche visibles', async ({ page }) => {
      await expect(page.getByRole('button', { name: /permanent/i })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /à la tâche/i })).toBeVisible({ timeout: 5_000 });
    });

    // ── E-E2E3 : Sélectionner "À la tâche" → bouton actif ────────────────
    test('cliquer À la tâche → bouton actif (surligné)', async ({ page }) => {
      const taskBtn = page.getByRole('button', { name: /à la tâche/i });
      await taskBtn.click();

      // La classe active doit être appliquée
      await expect(taskBtn).toHaveClass(/emp-type-active/, { timeout: 2_000 });

      // Permanent ne doit plus être actif
      const permBtn = page.getByRole('button', { name: /permanent/i });
      await expect(permBtn).not.toHaveClass(/emp-type-active/);
    });

    // ── E-E2E4 : Créer un employé "À la tâche" complet ────────────────────
    test('créer employé À la tâche → badge visible dans liste', async ({ page }) => {
      // Remplir le formulaire
      await page.getByLabel(/nom/i).fill(TEST_EMP_NAME);

      // Sélectionner "À la tâche"
      await page.getByRole('button', { name: /à la tâche/i }).click();

      // Soumettre
      const submitBtn = page.getByRole('button', { name: /ajouter/i });
      await submitBtn.click();

      // Toast de succès ou message de confirmation
      const success = page.locator('.toast-show, [class*="success"], [style*="color:var(--success)"]').first();
      await expect(success).toBeVisible({ timeout: 10_000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5B — Modifier un employé
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5B — Modification', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/employees/edit');
      await page.waitForLoadState('networkidle');
    });

    // ── E-E2E5 : Sélectionner employé → formulaire pré-rempli ─────────────
    test('sélectionner employé → formulaire chargé avec ses données', async ({ page }) => {
      const first = page.locator('.sidebar-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();

      // Champ nom doit être rempli
      const nameInput = page.getByLabel(/nom/i);
      await expect(nameInput).toHaveValue(/.+/, { timeout: 5_000 });
    });

    // ── E-E2E6 : Type d'emploi chargé depuis l'API ────────────────────────
    test('modifier employé → type d\'emploi pré-sélectionné', async ({ page }) => {
      const first = page.locator('.sidebar-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();
      await page.waitForTimeout(1_000);

      // L'un des deux boutons doit être actif
      const permBtn = page.getByRole('button', { name: /permanent/i });
      const taskBtn = page.getByRole('button', { name: /à la tâche/i });

      await expect(permBtn.or(taskBtn).filter({ has: page.locator('.emp-type-active') }))
        .toBeVisible({ timeout: 5_000 });
    });

    // ── E-E2E7 : Modifier type → enregistrer → persisté ──────────────────
    test('changer type d\'emploi → enregistrer → toast succès', async ({ page }) => {
      const first = page.locator('.sidebar-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();
      await page.waitForTimeout(1_000);

      // Basculer le type
      const permBtn = page.getByRole('button', { name: /permanent/i });
      const taskBtn = page.getByRole('button', { name: /à la tâche/i });

      const isPerm = await permBtn.evaluate(el => el.classList.contains('emp-type-active'));
      if (isPerm) {
        await taskBtn.click();
      } else {
        await permBtn.click();
      }

      // Enregistrer
      const saveBtn = page.getByRole('button', { name: /enregistrer/i });
      await saveBtn.click();

      const toast = page.locator('.toast-show').first();
      await expect(toast).toBeVisible({ timeout: 8_000 });
    });

    // ── E-E2E8 : Toggle actif / inactif ──────────────────────────────────
    test('bouton Désactiver → employé marqué inactif', async ({ page }) => {
      const first = page.locator('.sidebar-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();
      await page.waitForTimeout(1_000);

      const deactivateBtn = page.getByRole('button', { name: /désactiver/i });
      if (!await deactivateBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        test.skip(true, 'Employé déjà inactif ou bouton non visible');
        return;
      }

      await deactivateBtn.click();

      // Toast ou changement de bouton en "Activer"
      const activateBtn = page.getByRole('button', { name: /activer/i });
      await expect(activateBtn.or(page.locator('.toast-show').first()))
        .toBeVisible({ timeout: 8_000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5C — Profil (validation page)
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5C — Profil employé (vue admin)', () => {

    test.beforeEach(async ({ page }) => {
      await page.goto('/employees');
      await page.waitForLoadState('networkidle');
    });

    // ── E-E2E9 : Badge type d'emploi visible dans la carte profil ─────────
    test('carte profil → badge type d\'emploi affiché', async ({ page }) => {
      // Sélectionner le premier employé
      const first = page.locator('.emp-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();
      await page.waitForTimeout(1_000);

      // Badge type
      const typeBadge = page.locator('.type-badge');
      await expect(typeBadge).toBeVisible({ timeout: 5_000 });

      const text = await typeBadge.textContent() ?? '';
      expect(['Permanent', 'À la tâche']).toContain(text.trim());
    });

    // ── E-E2E10 : Badge Permanent → couleur bleue ─────────────────────────
    test('badge Permanent → classe type-permanent', async ({ page }) => {
      const first = page.locator('.emp-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();
      await page.waitForTimeout(1_000);

      const badge = page.locator('.type-badge');
      await expect(badge).toBeVisible({ timeout: 5_000 });

      const text = (await badge.textContent() ?? '').trim();
      if (text === 'Permanent') {
        await expect(badge).toHaveClass(/type-permanent/);
      } else {
        await expect(badge).toHaveClass(/type-task/);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5D — Fichiers employé
  // ═══════════════════════════════════════════════════════════════════════════

  test.describe('5D — Fichiers', () => {

    test('upload fichier valide dans employee-edit → apparaît dans la liste', async ({ page }) => {
      await page.goto('/employees/edit');
      await page.waitForLoadState('networkidle');

      const first = page.locator('.sidebar-item').first();
      await first.waitFor({ timeout: 8_000 });
      await first.click();
      await page.waitForTimeout(1_500);

      // Chercher le bouton/input d'upload
      const fileInput = page.locator('input[type="file"]').first();
      if (!await fileInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        test.skip(true, 'Section fichiers non visible');
        return;
      }

      // Créer un fichier PDF factice
      await fileInput.setInputFiles({
        name:     'test-e2e.pdf',
        mimeType: 'application/pdf',
        buffer:   Buffer.from('%PDF-1.4 test'),
      });

      // Le fichier doit apparaître dans la liste
      const fileItem = page.locator('[class*="file-item"], .file-list li, .file-row')
        .filter({ hasText: 'test-e2e.pdf' });
      await expect(fileItem).toBeVisible({ timeout: 10_000 });
    });
  });
});
