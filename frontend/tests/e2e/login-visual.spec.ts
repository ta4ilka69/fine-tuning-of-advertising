import { test, expect } from './login-fixture';

test.describe.configure({ retries: 0 });
for (const state of ['desktop', 'mobile', 'error', 'loading'] as const) {
  test(`вход ${state} @visual`, async ({ page, loginServer }) => {
    await page.setViewportSize({ width: state === 'mobile' ? 390 : 1440, height: 900 });
    if (state === 'error') loginServer.controls.failLogin = true;
    if (state === 'loading') loginServer.controls.holdLogin = new Promise(() => {});
    await page.goto(`${loginServer.url}/login`);
    await expect(page.getByRole('heading', { name: 'С возвращением' })).toBeVisible();
    if (state === 'error' || state === 'loading') {
      await page.getByLabel('Логин').fill('agent_demo');
      await page.getByLabel('Пароль', { exact: false }).fill('test password');
      await page.getByRole('button', { name: 'Войти', exact: true }).click();
      if (state === 'error') await expect(page.getByRole('alert')).toContainText('Неверный логин или пароль');
      else await expect(page.getByRole('button', { name: 'Входим…' })).toBeDisabled();
      await page.getByRole('heading', { name: 'С возвращением' }).click();
    }
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`login-${state}.png`, { fullPage: true });
  });
}
