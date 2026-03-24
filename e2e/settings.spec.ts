import { test, expect } from '@playwright/test'

test.describe('Settings', () => {
  test('should show settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('h1')).toContainText('Settings')
  })

  test('should show execution mode configuration', async ({ page }) => {
    await page.goto('/settings')

    // Verify execution mode section exists
    await expect(page.locator('text=Execution')).toBeVisible({ timeout: 5000 })
  })

  test('should show security settings', async ({ page }) => {
    await page.goto('/settings')

    // Verify security section exists
    await expect(page.locator('text=Security')).toBeVisible({ timeout: 5000 })
  })
})
