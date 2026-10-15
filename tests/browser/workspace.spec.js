import { test, expect } from '@playwright/test';

const user = { id: 1, name: 'Taylor James', email: 'taylor@example.com', role: 'editor' };
function workspace() { return { accounts: [{ id: 1, provider: 'instagram', account_name: 'ZendX Studio', is_active: true, connection_status: 'connected', created_at: '2026-10-15 09:00:00' }], posts: [], targets: [], comments: [], metrics: { impressions: 0, engagements: 0, clicks: 0 }, integrations: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'].map(provider => ({ provider, configured: false })) }; }
test('login screen submits credentials and opens workspace', async ({ page }) => {
  let signedIn = false;
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/session') return route.fulfill({ json: { user: signedIn ? user : null, csrf: 'test-token' } });
    if (pathname === '/api/auth/login') { const body = route.request().postDataJSON(); expect(body.email).toBe('taylor@example.com'); signedIn = true; return route.fulfill({ json: { user, csrf: 'rotated' } }); }
    if (pathname === '/api/workspace') return route.fulfill({ json: workspace() });
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } });
  });
  await page.goto('/');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('testing-password');
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your workspace, in focus.' })).toBeVisible();
  await expect(page.getByText('Good things take a little planning.')).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: 'test-results/workspace-desktop.png', fullPage: true, animations: 'disabled' });
});
test('composer saves a draft; calendar, engagement and settings work on desktop and mobile', async ({ page }) => {
  const state = workspace();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/session') return route.fulfill({ json: { user, csrf: 'test-token' } });
    if (pathname === '/api/workspace') return route.fulfill({ json: state });
    if (pathname === '/api/posts') {
      const values = route.request().postDataJSON();
      expect(values.publish_now).toBe(false); expect(values.scheduled_at).toBeNull();
      state.posts.push({ ...values, id: 1, status: 'draft', created_at: '2026-10-15 09:00:00' });
      return route.fulfill({ status: 201, json: { id: 1, message: 'Draft saved.' } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Create post', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Give it a title').fill('A new chapter');
  await page.getByLabel('Your message').fill('Our next great idea.');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('status')).toContainText('Draft saved.');
  await page.getByRole('button', { name: 'Content library', exact: false }).first().click();
  await expect(page.getByText('A new chapter', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: 'Social accounts', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Expand your social circle' })).toBeVisible();
  await page.getByRole('button', { name: 'Engagement', exact: true }).click();
  await expect(page.getByText('Leave an internal note', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your workspace, in focus.' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workspace-mobile.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Create post', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close composer' }).click();
  expect(errors).toEqual([]);
});

test('connect redirects to the platform, returns Connected, and posts only to selected active accounts', async ({ page }) => {
  const state = workspace();
  state.accounts = [];
  state.integrations[0].configured = true;
  let submitted;
  await page.route('https://www.facebook.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: '<h1>Facebook authorization (test)</h1><a href="http://127.0.0.1:5173/api/oauth/facebook/callback?state=test-state&code=test-code">Authorize ZendX</a>',
  }));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { user, csrf: 'test-token' } });
    if (path === '/api/workspace') return route.fulfill({ json: state });
    // A script navigation keeps the provider request intercepted by Playwright;
    // the API integration suite separately verifies the real 302 response.
    if (path === '/api/oauth/facebook/start') return route.fulfill({ contentType: 'text/html', body: "<script>location.href='https://www.facebook.com/dialog/oauth?state=test-state'</script>" });
    if (path === '/api/oauth/facebook/callback') {
      state.accounts = [
        { id: 7, provider: 'facebook', account_name: 'My Facebook Page', is_active: true, connection_status: 'connected', created_at: '2026-10-15 09:00:00' },
        { id: 8, provider: 'instagram', account_name: 'My Instagram', is_active: true, connection_status: 'connected', created_at: '2026-10-15 09:00:00' },
        { id: 9, provider: 'linkedin', account_name: 'Paused LinkedIn', is_active: false, connection_status: 'connected', created_at: '2026-10-15 09:00:00' },
        { id: 10, provider: 'twitter', account_name: 'Expired X', is_active: true, connection_status: 'reconnect_required', created_at: '2026-10-15 09:00:00' },
      ];
      return route.fulfill({ status: 302, headers: { location: '/?view=accounts&notice=Social%20account%20connected.' } });
    }
    if (path === '/api/accounts/7') {
      expect(route.request().method()).toBe('PATCH');
      state.accounts[0].is_active = route.request().postDataJSON().is_active;
      return route.fulfill({ json: { message: state.accounts[0].is_active ? 'Account activated for posting.' : 'Account paused.' } });
    }
    if (path === '/api/posts') {
      submitted = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { id: 1, message: 'Post queued for publishing.' } });
    }
    return route.fulfill({ status: 404, json: { error: 'Unexpected request' } });
  });
  await page.goto('/?view=accounts');
  await expect(page.getByRole('heading', { name: 'Choose your first social platform.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Need an account? Sign up' }).first()).toHaveAttribute('href', 'https://www.facebook.com/r.php');
  await page.getByRole('link', { name: 'Connect', exact: true }).click();
  await expect(page).toHaveURL(/www\.facebook\.com/);
  await page.getByRole('link', { name: 'Authorize ZendX' }).click();
  await expect(page.getByRole('status')).toContainText('Social account connected.');
  await expect(page.getByRole('heading', { name: 'My Facebook Page', exact: true })).toBeVisible();
  await expect(page.locator('.account-card').filter({ hasText: 'My Facebook Page' }).getByText('Connected', { exact: true })).toBeVisible();
  await page.getByRole('switch', { name: 'Activate My Facebook Page for posting' }).uncheck();
  await expect(page.getByText('Paused for posting').first()).toBeVisible();
  await page.getByRole('switch', { name: 'Activate My Facebook Page for posting' }).check();
  await expect(page.getByRole('switch', { name: 'Activate My Facebook Page for posting' })).toBeChecked();
  await page.getByRole('button', { name: 'Create post', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('My Facebook Page')).not.toBeChecked();
  await expect(dialog.getByLabel('My Instagram')).not.toBeChecked();
  await expect(dialog.getByText('Paused LinkedIn')).toHaveCount(0);
  await expect(dialog.getByText('Expired X')).toHaveCount(0);
  await dialog.getByLabel('Your message').fill('Only send this to Facebook.');
  await dialog.getByLabel('My Facebook Page').check();
  await dialog.getByRole('button', { name: 'Publish now' }).click();
  await expect(dialog).not.toBeVisible();
  expect(submitted.account_ids).toEqual([7]);
  expect(submitted.publish_now).toBe(true);
});
