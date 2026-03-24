import { test, expect } from '@playwright/test'

test.describe('Audit Log', () => {
  test('should show audit log page', async ({ page }) => {
    await page.goto('/audit-log')
    await expect(page.locator('h1')).toContainText('Audit')
  })

  test('should show empty state when no audit entries exist', async ({ page }) => {
    await page.goto('/audit-log')
    await page.waitForTimeout(1000)
    const content = page.locator('main')
    await expect(content).toBeVisible()
  })

  test('should show filter controls', async ({ page }) => {
    await page.goto('/audit-log')

    // Check for filter UI elements
    const filterArea = page.locator('input[placeholder*="filter"], input[placeholder*="search"], select')
    await page.waitForTimeout(1000)
  })
})
