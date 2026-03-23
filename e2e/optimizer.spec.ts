import { test, expect } from '@playwright/test'

test.describe('Optimizer', () => {
  test('should show optimizer page', async ({ page }) => {
    await page.goto('/optimizer')
    await expect(page.locator('h1')).toContainText('Optimizer')
  })

  test('should show create optimizer run form', async ({ page }) => {
    await page.goto('/optimizer')

    const createBtn = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("Start")')
    if (await createBtn.first().isVisible()) {
      await createBtn.first().click()

      // Verify form fields exist
      const repoSelect = page.locator('select, [role="combobox"]').first()
      await expect(repoSelect).toBeVisible({ timeout: 5000 })
    }
  })

  test('should show optimizer run detail page', async ({ page }) => {
    await page.goto('/optimizer')

    const runLink = page.locator('a[href^="/optimizer/"]').first()
    if (await runLink.isVisible()) {
      await runLink.click()
      await expect(page.locator('h1, h2')).toBeVisible({ timeout: 5000 })
    }
  })
})
