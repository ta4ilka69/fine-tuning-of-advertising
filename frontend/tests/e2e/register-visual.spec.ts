import { test, expect } from './login-fixture';

test.describe.configure({ retries: 0 });
for (const state of ['desktop', 'mobile', 'narrow', 'fields', 'taken', 'loading'] as const) {
  test(`регистрация ${state} @visual`, async ({ page, loginServer }) => {
    await page.setViewportSize({ width: state === 'mobile' ? 390 : state === 'narrow' ? 320 : 1440, height: 900 });
    if (state === 'taken') loginServer.controls.registerError = 409;
    if (state === 'loading') loginServer.controls.holdRegister = new Promise(() => {});
    await page.goto(`${loginServer.url}/register`);
    await expect(page.getByRole('heading', { name: 'Создать аккаунт' })).toBeVisible();
    if (state === 'fields' || state === 'taken' || state === 'loading') {
      await page.getByRole('textbox', { name: /^Логин/ }).fill(state === 'fields' ? 'ab' : 'agent_demo');
      await page.getByLabel('Пароль', { exact: true }).fill(state === 'fields' ? 'short' : 'test password');
      await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click();
      if (state === 'fields') await expect(page.getByRole('alert')).toContainText('Проверьте поля');
      if (state === 'taken') await expect(page.getByRole('alert')).toContainText('Логин уже занят');
      if (state === 'loading') await expect(page.getByRole('button', { name: 'Регистрируем…' })).toBeDisabled();
      await page.getByRole('heading', { name: 'Создать аккаунт' }).click();
    }
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`register-${state}.png`, { fullPage: true });
  });
}
