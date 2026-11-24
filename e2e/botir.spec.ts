import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end walk through the demo the jury will click: a personal agent request,
 * the live agent-to-agent negotiation, confirmation, and the payment page.
 *
 * Two things this spec deliberately does NOT do:
 *  - it does not log in: /assistant works without an account (the jury opens it the
 *    same way). Login (/login, POST /auth/login, test accounts in apps/api/README.md)
 *    can be added as a separate step;
 *  - it never completes a payment. It stops at the payment page.
 */

const ASSISTANT_REQUEST =
  "Ertaga 18:00 ga 6 kishilik osh joy band qil, keyin Chilonzorda moy almashtirishga yozdir";

const SHOT_DIR = 'e2e/screenshots';

async function shot(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 0;
  await page.screenshot({ path: `${SHOT_DIR}/${name}-${width}.png`, fullPage: true });
}

test.describe('Botir AI — assistant to payment', () => {
  test('personal agent negotiates and reaches the payment page', async ({ page }) => {
    await page.goto('/');
    await shot(page, '01-landing');

    // Which mode are we in? With a live API the badge reads "Jonli", otherwise "Demo".
    // The test asserts the badge exists, and reports which one ran — a green run
    // against a dead backend would otherwise prove nothing.
    const badge = page.getByText(/Demo|Jonli/i).first();
    await expect(badge).toBeVisible();
    const mode = ((await badge.textContent()) ?? '').trim();
    test.info().annotations.push({ type: 'mode', description: mode });

    await page.goto('/assistant');
    await expect(page.getByRole('textbox').first()).toBeVisible();
    await page.getByRole('textbox').first().fill(ASSISTANT_REQUEST);
    await shot(page, '02-assistant-filled');

    await page.getByRole('button').filter({ hasText: /yubor|so'ra|jo'nat|send/i }).first().click();

    // The negotiation screen streams A2A turns; the first business line is the signal
    // that the personal agent reached at least one business agent.
    await expect(page).toHaveURL(/\/live\//, { timeout: 15_000 });
    await expect(page.getByText(/Mijoz agenti/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/so'm/i).first()).toBeVisible({ timeout: 20_000 });
    await shot(page, '03-negotiation');

    const confirm = page.getByRole('button').filter({ hasText: /tasdiqla/i }).first();
    await expect(confirm).toBeEnabled({ timeout: 20_000 });
    await confirm.click();

    // Payment page must open, and nothing is paid here.
    await expect(page.getByText(/to'lov|payment|pay/i).first()).toBeVisible({ timeout: 15_000 });
    await shot(page, '04-payment');
  });

  test('business cabinet shows catalog and inbox', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText(/biznes|katalog|dashboard/i).first()).toBeVisible();
    await shot(page, '05-dashboard');

    await page.goto('/dashboard/inbox');
    await expect(page.getByText(/inbox|xabar|chat/i).first()).toBeVisible();
    await shot(page, '06-inbox');
  });
});
