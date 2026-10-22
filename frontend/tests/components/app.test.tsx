import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from '../../src/app/App';

test('главная доступна с основным заголовком и площадками', () => {
  render(<App />);
  const main = screen.getByRole('main');
  expect(within(main).getByRole('heading', { level: 1 })).toBeVisible();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  const channels = within(main).getByLabelText('Площадки размещения');
  for (const name of ['Авито', 'ЦИАН', 'Telegram']) {
    expect(within(channels).getByText(name)).toBeVisible();
  }
});
