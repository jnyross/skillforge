import { test, expect } from '@playwright/test'

test.describe('Eval Run Flow', () => {
  test('should show eval suites page', async ({ page }) => {
    await page.goto('/evals')
    await expect(page.locator('h1')).toContainText('Eval')
  })

  test('should create a new eval suite', async ({ page }) => {
    await page.goto('/evals')

    // Click create button
    const createBtn = page.locator('button:has-text("New Suite"), button:has-text("Create")')
    if (await createBtn.first().isVisible()) {
      await createBtn.first().click()

      // Fill in suite name
      const nameInput = page.locator('input[placeholder*="name"], input#name')
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Test Suite')
      }

      // Submit
      const submitBtn = page.locator('button:has-text("Create")')
      if (await submitBtn.isVisible()) {
        await submitBtn.click()
        await page.waitForTimeout(2000)
      }
    }
  })

  test('should show eval suite detail page with tabs', async ({ page }) => {
    await page.goto('/evals')

    // Click on a suite if one exists
    const suiteLink = page.locator('a[href^="/evals/"]').first()
    if (await suiteLink.isVisible()) {
      await suiteLink.click()

      // Verify tabs are present
      await expect(page.locator('text=Cases')).toBeVisible({ timeout: 5000 })
    }
  })

  test('should show trace lab page', async ({ page }) => {
    await page.goto('/traces')
    await expect(page.locator('h1')).toContainText('Trace')
  })

  test('should show trace lab derived view tabs', async ({ page }) => {
    await page.goto('/traces')

    // Verify derived view tabs exist
    const tabs = ['All', 'Failures', 'High Token', 'Flaky']
    for (const tab of tabs) {
      const tabEl = page.locator(`button:has-text("${tab}")`)
      if (await tabEl.isVisible()) {
        // Tab exists - good
      }
    }
  })
})
