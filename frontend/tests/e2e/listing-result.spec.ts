import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from './login-fixture';
import { generationResult, listing, listingDetails } from '../fixtures/listings';

const avito = {
  ...generationResult.channels[0]!,
  title: 'Светлая 2-комнатная квартира у метро',
  text: 'Продаётся светлая двухкомнатная квартира площадью 54 м² на Лесном проспекте, 10.\n\nДве отдельные комнаты, кухня 11 м² и раздельный санузел. Квартира после ремонта: светлые стены и спокойные цвета.',
};
const cian = {
  ...avito,
  channel: { id: '70792597-4a2a-4ddb-9d00-c2340dd8c002', name: 'ЦИАН' },
  title: '2-комнатная квартира, 54 м², Лесной проспект',
  text: 'Квартира на 7-м этаже. Жилая площадь — 30 м², кухня — 11 м².',
};
const telegram = {
  ...avito,
  channel: { id: '70792597-4a2a-4ddb-9d00-c2340dd8c003', name: 'Telegram' },
  title: 'Светлая двушка у «Выборгской»',
  text: 'До метро «Выборгская» — 8 минут пешком.\n\nСтоимость — 9 800 000 ₽.',
};

const test = base.extend<{ openListing: (detail?: ReturnType<typeof listingDetails>) => Promise<void> }>({
  openListing: async ({ page, context, loginServer }, provide) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: loginServer.url }]);
    await provide(async (detail = { ...listingDetails(), result: { channels: [avito, cian, telegram] } }) => {
      loginServer.controls.detail = detail;
      await page.goto(`${loginServer.url}/app/listings/${detail.id}`);
    });
  },
});

for (const width of [320, 390, 1440]) {
  test(`тексты площадок на ширине ${width} px`, async ({ page, openListing }) => {
    await page.setViewportSize({ width, height: 900 });
    const result = width === 320 ? { channels: [avito, cian, telegram, {
      ...telegram,
      channel: { id: '70792597-4a2a-4ddb-9d00-c2340dd8c004', name: 'ОченьДлинноеНазваниеПлощадкиБезПробелов' },
      text: 'длинноеслово'.repeat(30),
    }] } : { channels: [avito, cian, telegram] };
    await openListing({ ...listingDetails(), result });
    const section = page.getByRole('region', { name: 'Результат', exact: true });
    await expect(section.getByRole('heading', { name: avito.title })).toBeVisible();
    await expect(section.getByText(avito.text, { exact: true })).toHaveCSS('white-space', 'pre-wrap');
    for (const channel of result.channels.slice(1)) {
      const tab = section.getByRole('tab', { name: channel.channel.name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
      const panel = section.getByRole('tabpanel', { name: channel.channel.name });
      await expect(panel.getByRole('heading', { name: channel.title })).toBeVisible();
      await expect(panel.getByText(channel.text, { exact: true })).toBeVisible();
      await expect(section.getByText(avito.text, { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    if (width === 390) {
      const { violations } = await new AxeBuilder({ page }).include('section[aria-labelledby="listing-result-heading"]').analyze();
      expect(violations).toEqual([]);
    }
  });
}

test('вкладки и обе кнопки копирования работают с клавиатуры, ошибку можно повторить', async ({ browserName, page, openListing }) => {
  const tabKey = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  const copied: string[] = [];
  let reject = true;
  await page.exposeFunction('writeTestClipboard', (value: string) => {
    if (reject) throw new Error('Нет доступа к буферу обмена');
    copied.push(value);
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: Reflect.get(window, 'writeTestClipboard') } });
  });
  await openListing();
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  const avitoTab = section.getByRole('tab', { name: avito.channel.name });
  const cianTab = section.getByRole('tab', { name: cian.channel.name });
  const telegramTab = section.getByRole('tab', { name: telegram.channel.name });
  await avitoTab.focus();
  await page.keyboard.press('End');
  await expect(telegramTab).toBeFocused();
  await expect(avitoTab).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(telegramTab).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(avitoTab).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(cianTab).toBeFocused();
  await page.keyboard.press('Space');
  await expect(section.getByRole('tabpanel', { name: cian.channel.name })).toBeVisible();
  const copyTitle = section.getByRole('button', { name: 'Копировать заголовок' });
  await page.keyboard.press(tabKey);
  await expect(copyTitle).toBeFocused();
  await page.keyboard.press('Enter');
  const alert = section.getByRole('alert');
  await expect(alert).toContainText('Не удалось скопировать заголовок');
  await expect(alert).toContainText('Ctrl+C');
  await expect(section.getByRole('heading', { name: cian.title })).toBeVisible();
  expect(copied).toEqual([]);

  reject = false;
  await alert.getByRole('button', { name: 'Повторить копирование' }).press('Enter');
  await expect(section.getByRole('status')).toHaveText('Заголовок скопирован');
  await expect(copyTitle).toBeFocused();
  await telegramTab.focus();
  await page.keyboard.press('Enter');
  await expect(section.getByRole('status')).toBeEmpty();
  await page.keyboard.press(tabKey);
  await page.keyboard.press(tabKey);
  await expect(section.getByRole('button', { name: 'Копировать текст' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(section.getByRole('status')).toHaveText('Текст скопирован');
  expect(copied).toEqual([cian.title, telegram.text]);
});

test('карточка без результата показывает подсказку без вкладок и кнопок копирования', async ({ page, openListing }) => {
  await openListing(listingDetails(listing({ status: 'draft', hasResult: false })));
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  await expect(section.getByText('Текстов пока нет')).toBeVisible();
  await expect(section.getByRole('tab')).toHaveCount(0);
  await expect(section.getByRole('button')).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`блок текстов ${width} px @visual @capture`, async ({ page, openListing }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openListing();
    const section = page.getByRole('region', { name: 'Результат', exact: true });
    await expect(section.getByRole('heading', { name: avito.title })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const capture = async (name: string) => {
      const path = testInfo.outputPath(`${name}.png`);
      await page.mouse.move(0, 0);
      await section.screenshot({ path, animations: 'disabled', caret: 'hide', scale: 'css' });
      await testInfo.attach(name, { path, contentType: 'image/png' });
    };
    await capture(`result-texts-${width}`);
    if (width === 1440) {
      await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
      await section.getByRole('tab', { name: telegram.channel.name }).click();
      await section.getByRole('button', { name: 'Копировать текст' }).click();
      await expect(section.getByRole('alert')).toContainText('Не удалось скопировать текст');
      await capture('result-copy-error');
    }
  });
}
