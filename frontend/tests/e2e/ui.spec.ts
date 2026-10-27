import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures';
import { openUIFixture } from './ui-fixture';

for (const header of ['guest', 'user', 'admin']) {
  for (const width of [320, 768, 1440]) {
    test(`основа ${header} помещается на ${width} px и доступна`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openUIFixture(page, header);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations).toEqual([]);
      if (header !== 'guest') {
        const account = page.getByRole('button', { name: /Меню пользователя:/ });
        await account.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('menuitem', { name: 'Мои объявления' })).toBeVisible();
        if (header === 'admin') await expect(page.getByRole('menuitem', { name: 'Площадки' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(account).toBeFocused();
      }
    });
  }
}

test('клавиатура, фокус, ошибки и блокировка действий', async ({ page }) => {
  await openUIFixture(page);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'К содержимому' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  const primary = page.getByRole('button', { name: 'Основная', exact: true });
  await page.keyboard.press('Tab');
  await expect(primary).toBeFocused();
  expect(await primary.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(page.getByText('Выполнено действий: 2')).toBeVisible();
  for (const name of ['Основная: загрузка', 'Основная: недоступна', 'Загрузка фото', 'Недоступное действие']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toBeDisabled();
    await button.click({ force: true });
  }
  await expect(page.getByText('Выполнено действий: 2')).toBeVisible();
  const address = page.getByRole('textbox', { name: 'Адрес', exact: true });
  await address.fill('Лесной проспект, 10');
  await expect(address).toHaveAccessibleDescription('Укажите адрес объекта');
  await expect(page.getByRole('textbox', { name: 'Площадь', exact: true })).toHaveAccessibleDescription('Укажите площадь больше нуля');
  const select = page.getByRole('combobox', { name: 'Тип сделки' });
  await select.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(select).toHaveValue('Продажа');
  const checkbox = page.getByRole('checkbox', { name: 'Авито', exact: true });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  const toggle = page.getByRole('switch', { name: 'Сохранять черновик' });
  await toggle.focus();
  await page.keyboard.press('Space');
  await expect(toggle).toBeChecked();
  await page.getByRole('button', { name: 'Закрыть уведомление «Изменения сохранены»' }).click();
  await expect(page.getByText('Изменения сохранены')).toHaveCount(0);
});

test('тестовая страница отсутствует в приложении', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Общие элементы' })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('button', { name: 'Начать работу' })).toBeEnabled();
});
