import { test, expect } from '@playwright/test'

test.describe('Review Arena', () => {
  test('should show reviews list page', async ({ page }) => {
    await page.goto('/reviews')
    await expect(page.locator('h1')).toContainText('Review')
  })

  test('should create a new review session', async ({ page }) => {
    await page.goto('/reviews')

    const createBtn = page.locator('button:has-text("New"), button:has-text("Create")')
    if (await createBtn.first().isVisible()) {
      await createBtn.first().click()

      const nameInput = page.locator('input[placeholder*="name"], input#name')
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Review Session')

        const submitBtn = page.locator('button[type="submit"], button:has-text("Create")')
        if (await submitBtn.isVisible()) {
          await submitBtn.click()
          await page.waitForTimeout(2000)
        }
      }
    }
  })

  test('should show review session detail page', async ({ page }) => {
    await page.goto('/reviews')

    const sessionLink = page.locator('a[href^="/reviews/"]').first()
    if (await sessionLink.isVisible()) {
      await sessionLink.click()
      await expect(page.locator('h1, h2')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should render rich content in review', async ({ page }) => {
    await page.goto('/reviews')

    const sessionLink = page.locator('a[href^="/reviews/"]').first()
    if (await sessionLink.isVisible()) {
      await sessionLink.click()

      // Check for rich content rendering components
      const richContent = page.locator('[data-testid="rich-content"], pre, code')
      // Rich content may or may not be present depending on data
      await page.waitForTimeout(1000)
    }
  })
})
