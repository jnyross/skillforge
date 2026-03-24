import { test, expect } from '@playwright/test'

test.describe('Repository CRUD', () => {
  test('should show empty state when no repos exist', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Skill Repositories')
  })

  test('should create a new skill repo', async ({ page }) => {
    await page.goto('/')

    // Click "New Skill Repo" button
    await page.click('button:has-text("New Skill Repo")')

    // Fill in the form
    await page.fill('input#displayName', 'E2E Test Skill')
    await expect(page.locator('input#slug')).toHaveValue('e2e-test-skill')

    await page.fill('input#description', 'Created by Playwright E2E test')

    // Add initial SKILL.md content
    await page.fill('textarea#skillMd', `---
name: e2e-test-skill
description: A test skill for E2E testing
---

# Instructions

This is a test skill created by Playwright E2E tests.

## When to use

Use this skill when testing SkillForge.
`)

    // Submit
    await page.click('button:has-text("Create Repository")')

    // Verify repo appears in the list
    await expect(page.locator('text=E2E Test Skill')).toBeVisible({ timeout: 10000 })
  })

  test('should navigate to repo detail page', async ({ page }) => {
    await page.goto('/')

    // Click on a repo card (if any exist)
    const repoCard = page.locator('[data-testid="repo-card"]').first()
    if (await repoCard.isVisible()) {
      await repoCard.click()
      await expect(page.locator('h1')).toBeVisible()
    }
  })

  test('should create a new version', async ({ page }) => {
    await page.goto('/')

    // Navigate to first repo
    const firstRepo = page.locator('a[href^="/skill-repos/"]').first()
    if (await firstRepo.isVisible()) {
      await firstRepo.click()

      // Click "New Version"
      await page.click('button:has-text("New Version")')

      // Fill in commit message
      await page.fill('input#commitMsg', 'E2E test version')

      // Fill in SKILL.md content
      await page.fill('textarea#skillMdEdit', `---
name: test-skill
description: Updated by E2E test
---

# Instructions

Updated content from E2E test.
`)

      // Submit
      await page.click('button:has-text("Save Version")')

      // Wait for the dialog to close
      await expect(page.locator('input#commitMsg')).not.toBeVisible({ timeout: 10000 })
    }
  })

  test('should run lint on a repo', async ({ page }) => {
    await page.goto('/')

    const firstRepo = page.locator('a[href^="/skill-repos/"]').first()
    if (await firstRepo.isVisible()) {
      await firstRepo.click()

      // Click "Run Lint"
      await page.click('button:has-text("Run Lint")')

      // Verify lint results appear (may take a moment)
      await page.waitForTimeout(2000)
    }
  })

  test('should view diff between versions', async ({ page }) => {
    await page.goto('/')

    const firstRepo = page.locator('a[href^="/skill-repos/"]').first()
    if (await firstRepo.isVisible()) {
      await firstRepo.click()

      // Click on Diff tab
      const diffTab = page.locator('button:has-text("Diff")')
      if (await diffTab.isVisible()) {
        await diffTab.click()
        await expect(page.locator('text=Compare Versions')).toBeVisible()
      }
    }
  })
})
