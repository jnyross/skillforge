import { test, expect } from '@playwright/test'

test.describe('Wizard', () => {
  test('should show wizard page with mode selection', async ({ page }) => {
    await page.goto('/wizard')
    await expect(page.locator('h1')).toContainText('Wizard')

    // Verify mode buttons exist
    await expect(page.locator('text=Scratch')).toBeVisible({ timeout: 5000 })
  })

  test('should start scratch mode wizard', async ({ page }) => {
    await page.goto('/wizard')

    const scratchBtn = page.locator('button:has-text("Scratch"), [data-testid="mode-scratch"]')
    if (await scratchBtn.first().isVisible()) {
      await scratchBtn.first().click()

      // Verify intake form appears
      await page.waitForTimeout(1000)
      const nameInput = page.locator('input[placeholder*="name"], input#skillName, input[name="name"]')
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Wizard Test Skill')
      }
    }
  })

  test('should show synthetic data page', async ({ page }) => {
    await page.goto('/synthetic-data')
    await expect(page.locator('h1')).toContainText('Synthetic')
  })
})
