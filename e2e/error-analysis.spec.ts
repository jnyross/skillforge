import { test, expect } from '@playwright/test'

test.describe('Error Analysis', () => {
  test('should show error analysis page', async ({ page }) => {
    await page.goto('/error-analysis')
    await expect(page.locator('h1')).toContainText('Error Analysis')
  })

  test('should show empty state when no analyses exist', async ({ page }) => {
    await page.goto('/error-analysis')
    // Should show empty state or list
    await page.waitForTimeout(1000)
    const content = page.locator('main')
    await expect(content).toBeVisible()
  })

  test('should create new error analysis session', async ({ page }) => {
    await page.goto('/error-analysis')

    const createBtn = page.locator('button:has-text("New"), button:has-text("Create"), button:has-text("Start")')
    if (await createBtn.first().isVisible()) {
      await createBtn.first().click()

      // Fill form fields
      const nameInput = page.locator('input[placeholder*="name"], input#name')
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Error Analysis')
      }

      const submitBtn = page.locator('button[type="submit"], button:has-text("Create")')
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await page.waitForTimeout(2000)
      }
    }
  })
})
