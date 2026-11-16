import AxeBuilder from '@axe-core/playwright';
import { test as base, expect } from './login-fixture';
import { generationResult, listing, listingDetails } from '../fixtures/listings';
import type { GenerationResult } from '../../src/shared/api/types';

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

type ResultListing = Omit<ReturnType<typeof listingDetails>, 'result'> & { result: GenerationResult | null };

const test = base.extend<{ openListing: (detail?: ResultListing) => Promise<void> }>({
  openListing: async ({ page, context, loginServer }, provide) => {
    await context.addCookies([{ name: 'session', value: 'test-session', url: loginServer.url }]);
    await provide(async (detail = { ...listingDetails(), result: { channels: [avito, cian, telegram] } }) => {
      loginServer.controls.detail = detail;
      await page.goto(`${loginServer.url}/app/listings/${detail.id}`);
    });
  },
});

const room = listingDetails().photos[0]!;
const withPhoto = (id: string, fileName: string) => ({
  ...room, id, fileName,
  contentUrl: room.contentUrl.replace(room.id, id),
  thumbnailUrl: room.thumbnailUrl.replace(room.id, id),
});
const kitchen = withPhoto('eab3b59f-389a-46e7-b6fc-9f760ea02b92', 'kitchen.jpg');
const bedroom = withPhoto('fab3b59f-389a-46e7-b6fc-9f760ea02b93', 'bedroom.jpg');

const scoredResult = {
  score: 0,
  why: [
    { plus: true, text: 'В объявлении указаны адрес, цена и площадь' },
    { plus: true, text: 'На фотографиях видны жилые комнаты' },
    { plus: false, text: 'Нет фотографии санузла' },
  ],
  channels: [{
    ...avito, photoIds: [kitchen.id, room.id, bedroom.id], photos: { top: [
      { photo_id: kitchen.id, why: 'Видна обеденная зона' },
      { photo_id: room.id, why: 'Виден общий план гостиной' },
      { photo_id: bedroom.id, why: 'Хорошо виден размер спальни' },
    ] },
  }, {
    ...cian, photoIds: [room.id, kitchen.id], photos: { top: [
      { photo_id: room.id, why: 'В гостиной видны окна' },
      { photo_id: kitchen.id, why: 'Виден размер кухни' },
    ] },
  }, {
    ...telegram, photoIds: [bedroom.id], photos: { top: [{ photo_id: bedroom.id, why: 'Хорошо видно освещение спальни' }] },
  }],
};

for (const width of [320, 390, 1440]) {
  test(`оценка и рекомендации площадок на ширине ${width} px`, async ({ page, openListing }) => {
    await page.setViewportSize({ width, height: 900 });
    await openListing({ ...listingDetails(), photos: [room, kitchen, bedroom], result: scoredResult });
    const section = page.getByRole('region', { name: 'Результат', exact: true });
    const assessment = section.getByRole('list', { name: 'Причины оценки' });
    await expect(section.getByText('0', { exact: true })).toBeVisible();
    await expect(section.getByText('из 100', { exact: true })).toBeVisible();
    for (const reason of scoredResult.why) await expect(assessment.getByText(reason.text)).toBeVisible();
    await expect(section.getByText('Результат устарел', { exact: true })).toHaveCount(0);
    for (const [index, names] of [[kitchen.fileName, room.fileName, bedroom.fileName], [room.fileName, kitchen.fileName], [bedroom.fileName]].entries()) {
      const channel = scoredResult.channels[index]!;
      await section.getByRole('tab', { name: channel.channel.name }).click();
      const panel = section.getByRole('tabpanel', { name: channel.channel.name });
      const recommended = panel.getByRole('list', { name: 'Рекомендованные фотографии' });
      const images = recommended.getByRole('img');
      await expect(images).toHaveCount(names.length);
      expect(await images.evaluateAll((items) => items.map((item) => item.getAttribute('alt')))).toEqual(names);
      for (const photo of channel.photos.top) await expect(recommended.getByText(photo.why)).toBeVisible();
      await expect(section.getByText('0', { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    if (width === 390) {
      const { violations } = await new AxeBuilder({ page }).include('section[aria-labelledby="listing-result-heading"]').analyze();
      expect(violations).toEqual([]);
    }
  });
}

test('удалённые фотографии исчезают из сохранённого результата, оставшиеся сохраняют порядок', async ({ page, openListing }) => {
  await openListing({ ...listingDetails(), photos: [room, bedroom], result: scoredResult });
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  const recommended = section.getByRole('list', { name: 'Рекомендованные фотографии' });
  await expect(recommended.getByRole('img')).toHaveCount(2);
  await expect(recommended.getByRole('img').first()).toHaveAccessibleName(room.fileName);
  await expect(recommended.getByText('Видна обеденная зона')).toHaveCount(0);
  await page.getByRole('button', { name: `Удалить фотографию ${room.fileName}` }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Результат устарел' })).toBeVisible();
  await expect(recommended.getByRole('img')).toHaveCount(1);
  await expect(recommended.getByRole('img')).toHaveAccessibleName(bedroom.fileName);
  await expect(recommended.getByText('Хорошо виден размер спальни')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Копировать текст' })).toBeEnabled();
  await section.getByRole('tab', { name: cian.channel.name }).click();
  await expect(recommended).toHaveCount(0);
});

test('разный регистр UUID сохраняет фотографию и пояснение в рекомендациях', async ({ page, openListing }) => {
  const result = { ...scoredResult, channels: [{
    ...avito, photoIds: [room.id.toUpperCase(), bedroom.id, room.id], photos: { top: [
      { photo_id: room.id, why: 'Виден общий план гостиной' },
      { photo_id: bedroom.id.toUpperCase(), why: 'Хорошо виден размер спальни' },
    ] },
  }] };
  await openListing({ ...listingDetails(), photos: [bedroom, room], result });
  const recommended = page.getByRole('list', { name: 'Рекомендованные фотографии' });
  const images = recommended.getByRole('img');
  await expect(images).toHaveCount(2);
  await expect(images.nth(0)).toHaveAttribute('src', room.thumbnailUrl);
  await expect(images.nth(1)).toHaveAttribute('src', bedroom.thumbnailUrl);
  await expect(recommended.getByText('Виден общий план гостиной')).toBeVisible();
  await expect(recommended.getByText('Хорошо виден размер спальни')).toBeVisible();
});

test('превью с ответом 404 исчезает из рекомендаций до обновления карточки', async ({ page, openListing }) => {
  await page.route(`**${bedroom.thumbnailUrl}`, (route) => route.fulfill({ status: 404 }));
  await openListing({ ...listingDetails(), photos: [room, bedroom], result: scoredResult });
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  const recommended = section.getByRole('list', { name: 'Рекомендованные фотографии' });
  await recommended.scrollIntoViewIfNeeded();
  await expect(recommended.getByRole('img')).toHaveCount(1);
  await expect(recommended.getByRole('img')).toHaveAccessibleName(room.fileName);
  await expect(recommended.getByText('Хорошо виден размер спальни')).toHaveCount(0);
  await section.getByRole('tab', { name: telegram.channel.name }).click();
  await section.getByRole('tabpanel', { name: telegram.channel.name }).scrollIntoViewIfNeeded();
  await expect(recommended).toHaveCount(0);
});

test('новый результат повторно загружает недоступное ранее превью', async ({ page, openListing, loginServer }) => {
  const result = { ...scoredResult, channels: [scoredResult.channels[0]!] };
  const detail = { ...listingDetails(listing({ status: 'generating' })), result };
  loginServer.controls.photoImageError = true;
  const failedThumbnail = page.waitForResponse((response) => response.url().endsWith(room.thumbnailUrl) && response.status() === 404);
  await openListing(detail);
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  await expect(section.getByText('0', { exact: true })).toBeVisible();
  await failedThumbnail;
  await expect(section.getByRole('img', { name: room.fileName })).toHaveCount(0);

  loginServer.controls.photoImageError = false;
  loginServer.controls.detail = { ...detail, status: 'ready', result: { ...result, score: 74 } };
  await expect(section.getByText('74', { exact: true })).toBeVisible();
  const photo = section.getByRole('img', { name: room.fileName });
  await photo.scrollIntoViewIfNeeded();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test('результат старого формата показывает тексты и фото без общих оценок и пояснений', async ({ page, openListing }) => {
  await openListing({ ...listingDetails(listing({ status: 'draft' })), result: { channels: [avito] } });
  const section = page.getByRole('region', { name: 'Результат', exact: true });
  await expect(section.getByText('Результат устарел', { exact: true })).toBeVisible();
  await expect(section.getByRole('heading', { name: avito.title })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Оценка объявления' })).toHaveCount(0);
  await expect(section.getByRole('list', { name: 'Рекомендованные фотографии' }).getByRole('img')).toHaveAccessibleName(room.fileName);
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
  await expect(section.getByText('Результат устарел', { exact: true })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`блок результата ${width} px @visual @capture`, async ({ page, openListing }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const mobile = width === 390;
    await openListing({
      ...listingDetails(listing({ status: mobile ? 'draft' : 'ready' })),
      photos: mobile ? [room] : [room, kitchen, bedroom],
      result: { ...scoredResult, score: mobile ? 0 : 78 },
    });
    const section = page.getByRole('region', { name: 'Результат', exact: true });
    await expect(section.getByRole('heading', { name: avito.title })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const capture = async (name: string) => {
      const path = testInfo.outputPath(`${name}.png`);
      for (const photo of await section.getByRole('img').all()) {
        await photo.scrollIntoViewIfNeeded();
        await expect(photo).toHaveJSProperty('complete', true);
        expect(await photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      }
      await page.mouse.move(0, 0);
      await section.screenshot({
        path, animations: 'disabled', caret: 'hide', scale: 'css',
        style: 'a[href="#main-content"]:not(:focus) { visibility: hidden; }',
      });
      await testInfo.attach(name, { path, contentType: 'image/png' });
    };
    await capture(`result-score-${width}`);
    if (width === 1440) {
      await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
      await section.getByRole('tab', { name: telegram.channel.name }).click();
      await section.getByRole('button', { name: 'Копировать текст' }).click();
      await expect(section.getByRole('alert')).toContainText('Не удалось скопировать текст');
      await capture('result-copy-error');
    }
  });
}
