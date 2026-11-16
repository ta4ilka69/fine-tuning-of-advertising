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
  await page.keyboard.press(tabKey);
  await expect(alert.getByRole('button', { name: 'Повторить копирование' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(section.getByRole('status').filter({ hasText: 'Заголовок скопирован' })).toBeVisible();
  await expect(copyTitle).toBeFocused();
  await telegramTab.focus();
  await page.keyboard.press('Enter');
  await expect(section.getByText('Заголовок скопирован')).toHaveCount(0);
  await page.keyboard.press(tabKey);
  await page.keyboard.press(tabKey);
  await expect(section.getByRole('button', { name: 'Копировать текст' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(section.getByRole('status').filter({ hasText: 'Текст скопирован' })).toBeVisible();
  expect(copied).toEqual([cian.title, telegram.text]);
});

test('сообщения об успехе и ошибке копирования видны после прокрутки', async ({ page, openListing }) => {
  await page.setViewportSize({ width: 390, height: 540 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } });
  });
  await openListing({ ...listingDetails(), result: { channels: [{ ...avito, text: avito.text.repeat(8) }] } });
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  const textButton = section.getByRole('button', { name: 'Копировать текст' });
  await page.evaluate(() => document.fonts.ready);
  const scrollToButton = (top: number) => textButton.evaluate((element, y) => window.scrollBy(0, element.getBoundingClientRect().top - y), top);
  await scrollToButton(60);
  await textButton.click();
  await expect(section.getByRole('status').filter({ hasText: 'Текст скопирован' })).toBeInViewport({ ratio: 0.9 });

  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
  await scrollToButton(480);
  await textButton.click();
  const alert = section.getByRole('alert');
  await expect(alert).toContainText('Не удалось скопировать текст');
  await expect(alert).toBeInViewport({ ratio: 0.9 });
  await expect(alert.getByRole('button', { name: 'Повторить копирование' })).toBeInViewport({ ratio: 0.9 });
});

test('поздняя ошибка копирования не уводит с экрана кнопку, на которую перешёл фокус', async ({ page, openListing }) => {
  await page.setViewportSize({ width: 390, height: 390 });
  let finishCopy!: () => void;
  const waiting = new Promise<void>((resolve) => { finishCopy = resolve; });
  await page.exposeFunction('writeTestClipboard', async () => {
    await waiting;
    throw new Error('Нет доступа к буферу обмена');
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: Reflect.get(window, 'writeTestClipboard') } });
  });
  await openListing({ ...listingDetails(), result: { channels: [{ ...avito, title: 'Квартира на Лесном проспекте'.repeat(5) }] } });
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  const textButton = section.getByRole('button', { name: 'Копировать текст' });
  const titleButton = section.getByRole('button', { name: 'Копировать заголовок' });
  await page.evaluate(() => document.fonts.ready);
  await textButton.focus();
  await textButton.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().top - 330));
  await page.keyboard.press('Enter');
  await titleButton.evaluate((element: HTMLButtonElement) => element.focus({ preventScroll: true }));
  try {
    await expect(titleButton).toBeFocused();
    await expect(titleButton).toBeInViewport();
  } finally { finishCopy(); }
  await expect(section.getByRole('alert')).toContainText('Не удалось скопировать текст');
  await expect(titleButton).toBeFocused();
  await expect(titleButton).toBeInViewport();
});

for (const focus of ['tab', 'copy', 'outside'] as const) {
  test(`обновление площадок сохраняет клавиатурный фокус: ${focus}`, async ({ page, openListing, loginServer }) => {
    const original = listingDetails(listing({ status: 'generating' }));
    await openListing({ ...original, result: { channels: [avito, cian] } });
    const section = page.getByRole('region', { name: 'Результат', exact: true });
    const cianTab = section.getByRole('tab', { name: cian.channel.name });
    await expect(section.getByRole('heading', { name: avito.title })).toBeVisible();
    const outside = page.getByRole('button', { name: '← Мои объявления' });
    if (focus === 'copy') {
      await cianTab.click();
      await section.getByRole('button', { name: 'Копировать текст' }).focus();
    } else if (focus === 'tab') {
      await cianTab.focus();
    } else {
      await outside.focus();
    }
    loginServer.controls.detail = { ...original, status: 'ready', result: { channels: [telegram] } };
    await expect(section.getByRole('heading', { name: telegram.title })).toBeVisible();
    await expect(section.getByRole('tab')).toHaveCount(1);
    if (focus === 'outside') await expect(outside).toBeFocused();
    else await expect(section.getByRole('tab', { name: telegram.channel.name })).toBeFocused();

    if (focus === 'copy') {
      const running = { ...original, result: { channels: [telegram] } };
      await page.route('**/api/v1/channels', (route) => route.fulfill({ json: { items: [cian, telegram].map(({ channel }) => ({
        ...channel, description: channel.name, limits: { titleLimit: 100, textLimit: null }, number: 1,
      })) } }));
      await page.route(`**/api/v1/listings/${original.id}/validate`, (route) => route.fulfill({ json: {
        version: original.version, canGenerate: true, errors: [], warnings: [],
      } }));
      await page.route(`**/api/v1/listings/${original.id}/generations`, (route) => {
        loginServer.controls.detail = running;
        return route.fulfill({ status: 202, json: running });
      });
      const generation = page.getByRole('region', { name: 'Подготовка объявления' });
      await generation.getByRole('button', { name: 'Выбрать площадки' }).click();
      await generation.getByRole('checkbox', { name: cian.channel.name }).check();
      await generation.getByRole('checkbox', { name: telegram.channel.name }).check();
      await generation.getByRole('button', { name: 'Сгенерировать' }).click();
      await expect(generation.getByText('Идёт генерация')).toBeVisible();
      const copy = section.getByRole('button', { name: 'Копировать текст' });
      await copy.focus();
      loginServer.controls.detail = { ...original, status: 'ready', result: { channels: [cian, telegram] } };
      await expect(cianTab).toBeVisible();
      await expect(section.getByRole('tab', { name: telegram.channel.name })).toHaveAttribute('aria-selected', 'true');
      await expect(copy).toBeFocused();
    }
  });
}

test('перестановка площадок в ответе не меняет вкладку, открытую по умолчанию', async ({ page, openListing, loginServer }) => {
  const original = listingDetails(listing({ status: 'generating' }));
  await openListing({ ...original, result: { channels: [avito] } });
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  const copy = section.getByRole('button', { name: 'Копировать текст' });
  await copy.focus();
  loginServer.controls.detail = { ...original, status: 'ready', result: { channels: [cian, avito] } };
  await expect(section.getByRole('tab', { name: cian.channel.name })).toBeVisible();
  await expect(section.getByRole('tab', { name: avito.channel.name })).toHaveAttribute('aria-selected', 'true');
  await expect(copy).toBeFocused();
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
