import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const directory = new URL('../../node_modules/.cache/ui-fixture/', import.meta.url);
const contentTypes: Record<string, string> = { js: 'text/javascript', css: 'text/css', woff2: 'font/woff2', html: 'text/html' };

export async function openUIFixture(page: Page, header = 'guest') {
  await page.route('**/__ui/**', async (route) => {
    const path = new URL(route.request().url()).pathname.slice('/__ui/'.length);
    const file = new URL(path, directory);
    if (!file.href.startsWith(directory.href)) throw new Error('Недопустимый путь тестового файла');
    await route.fulfill({
      body: await readFile(fileURLToPath(file)),
      contentType: contentTypes[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream',
    });
  });
  await page.goto(header === 'session' ? '/__ui/index.html?session' : `/__ui/index.html?header=${header}`);
  if (header === 'session') {
    await page.getByRole('heading', { name: 'Проверка сессии' }).waitFor();
    return;
  }
  await page.getByRole('heading', { name: 'Общие элементы' }).waitFor();
  if (header !== 'guest') await page.getByRole('button', { name: /Меню пользователя:/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
}
