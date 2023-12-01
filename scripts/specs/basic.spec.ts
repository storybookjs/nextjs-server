import { test, expect } from '@playwright/test';
import { Page } from 'playwright';
import process from 'process';

const storybookUrl = process.env.STORYBOOK_URL || 'http://localhost:3000/storybook';
const buttonId = 'example-button--primary';

async function goToStorybook(page: Page, storyId = buttonId) {
  await page.goto(`${storybookUrl}?path=/story/${storyId}`);

  const preview = page.frameLocator('#storybook-preview-iframe');
  const root = preview.locator('#storybook-root:visible, #storybook-docs:visible');

  const docsLoadingPage = root.locator('.sb-preparing-docs');
  const storyLoadingPage = root.locator('.sb-preparing-story');
  await docsLoadingPage.waitFor({ state: 'hidden' });
  await storyLoadingPage.waitFor({ state: 'hidden' });

  return root;
}

test('should render button story when visited directly', async ({ page }) => {
  const storybookRoot = await goToStorybook(page);
  await expect(storybookRoot.locator('button')).toContainText('Button');
});

test('should change story within a component', async ({ page }) => {
  const storybookRoot = await goToStorybook(page);

  // FIXME why is this necessary?
  await new Promise((r) => setTimeout(r, 1000));

  await page.locator('#example-button--large').click();

  await expect(storybookRoot.locator('button')).toHaveClass(/button_storybook-button--large__/);
});

test('should change component', async ({ page }) => {
  const storybookRoot = await goToStorybook(page);

  await page.locator('#example-header').click();
  await page.locator('#example-header--logged-in').click();

  await expect(storybookRoot.locator('button')).toHaveText('Log out');
});

test('should change args', async ({ page }) => {
  const storybookRoot = await goToStorybook(page);

  const label = page
    .locator('#storybook-panel-root #panel-tab-content')
    .locator('textarea[name=label]');
  await label.fill('Changed');

  await expect(storybookRoot.locator('button')).toContainText('Changed');
});
