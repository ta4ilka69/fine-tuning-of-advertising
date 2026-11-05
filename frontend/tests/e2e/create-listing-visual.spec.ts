import { test, expect } from './login-fixture';

test.describe.configure({ retries: 0 });
for (const state of ['desktop', 'mobile', 'tablet', 'narrow', 'rent', 'house', 'errors', 'saving'] as const) {
  test(`форма создания ${state} @visual`, async ({ page, context, loginServer }) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: `${loginServer.url}/api/v1` }]);
    await page.setViewportSize({ width: state === 'mobile' ? 390 : state === 'tablet' ? 768 : state === 'narrow' ? 320 : 1440, height: 900 });
    if (state === 'saving') loginServer.controls.holdCreate = new Promise(() => {});
    if (state === 'errors') { loginServer.controls.createError = 422; loginServer.controls.createFields = ['/data/deal/price', '/data/building/buildYear']; }
    await page.goto(`${loginServer.url}/app/new`);
    await expect(page.getByRole('form', { name: 'Создание объявления' })).toBeVisible();
    await page.getByLabel('Тип сделки', { exact: true }).selectOption(state === 'rent' ? 'rent' : 'sale');
    await page.getByLabel('Тип недвижимости', { exact: true }).selectOption(state === 'house' ? 'house' : 'flat');
    if (['rent', 'house', 'errors', 'saving'].includes(state)) {
      await page.getByLabel('Адрес', { exact: true }).fill('Санкт-Петербург, Лесной проспект, 10');
      await page.getByLabel('Общая площадь, м²', { exact: true }).fill('54');
    }
    if (state === 'rent') {
      await page.getByLabel('Цена за месяц, ₽', { exact: true }).fill('65000'); await page.getByLabel('Залог, ₽', { exact: true }).fill('0');
      await page.getByLabel('Комиссия, %', { exact: true }).fill('0'); await page.getByLabel('Коммунальные платежи включены', { exact: true }).selectOption('false');
      await page.getByText('Условия проживания', { exact: true }).click(); await page.getByLabel('Можно с животными', { exact: true }).selectOption('false');
    }
    if (state === 'house') {
      await page.getByText('Дом и участок', { exact: true }).click();
      await page.getByLabel('Этажей в доме', { exact: true }).fill('2'); await page.getByLabel('Площадь участка', { exact: true }).fill('8');
      await page.getByLabel('Единица площади участка', { exact: true }).selectOption('sotka');
    }
    if (state === 'errors' || state === 'saving') {
      await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
      if (state === 'errors') await expect(page.getByRole('alert')).toBeVisible(); else await expect(page.getByText('Сохраняем объявление', { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('button', { name: /Меню пользователя/ })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page).toHaveScreenshot(`create-listing-${state}.png`, { fullPage: true });
  });
}
