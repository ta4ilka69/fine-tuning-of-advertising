import { Checkbox, MantineProvider, Select, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { cssVariablesResolver, theme } from '../../src/app/theme';
import { HomePage } from '../../src/pages/home/HomePage';
import { AppButton, type ActionIntent } from '../../src/shared/ui/AppButton';
import { AppNotice } from '../../src/shared/ui/AppNotice';
import { IconButton } from '../../src/shared/ui/IconButton';
import { LoadingState } from '../../src/shared/ui/LoadingState';
import { PageLayout } from '../../src/shared/ui/PageLayout';

function TestProvider({ children }: { children: ReactNode }) {
  return <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver} forceColorScheme="light" env="test">{children}</MantineProvider>;
}

for (const intent of ['primary', 'secondary', 'quiet', 'danger'] satisfies ActionIntent[]) {
  test(`кнопка ${intent} выполняет действие по Enter и пробелу`, async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<TestProvider><AppButton intent={intent} onClick={onClick}>Сохранить</AppButton></TestProvider>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveFocus();
    await user.keyboard('{Enter} ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });
}

for (const state of ['disabled', 'loading'] as const) {
  test(`${state} блокирует обычную кнопку и кнопку с иконкой`, async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <TestProvider>
        <AppButton {...{ [state]: true }} onClick={onClick}>Сохранить</AppButton>
        <IconButton label="Удалить фото" {...{ [state]: true }} onClick={onClick}><span aria-hidden="true">×</span></IconButton>
        <AppButton>Продолжить</AppButton>
      </TestProvider>,
    );
    for (const name of ['Сохранить', 'Удалить фото']) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      if (state === 'loading') expect(button).toHaveAttribute('aria-busy', 'true');
      await user.click(button);
    }
    expect(onClick).not.toHaveBeenCalled();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveFocus();
  });
}

for (const intent of ['primary', 'secondary', 'quiet', 'danger'] satisfies ActionIntent[]) {
  test(`кнопка с иконкой ${intent} имеет доступное имя и не отправляет форму`, async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(
      <TestProvider><form onSubmit={onSubmit}>
        <IconButton label="Удалить фото" intent={intent} onClick={onClick}><span aria-hidden="true">×</span></IconButton>
      </form></TestProvider>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
}

test('основная кнопка по умолчанию не отправляет форму, submit задаётся явно', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn((event) => event.preventDefault());
  render(<TestProvider><form onSubmit={onSubmit}><AppButton>Отмена</AppButton><AppButton type="submit">Сохранить</AppButton></form></TestProvider>);
  await user.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Сохранить' }));
  expect(onSubmit).toHaveBeenCalledOnce();
});

test('поля формы связаны с подписями, подсказкой и ошибкой', async () => {
  const user = userEvent.setup();
  render(
    <TestProvider><Stack>
      <TextInput label="Адрес" description="Улица и дом" error="Укажите номер дома" />
      <Textarea label="Комментарий" description="Важные детали" />
      <TextInput label="Заблокированное поле" disabled value="Сохранено" />
    </Stack></TestProvider>,
  );
  const address = screen.getByRole('textbox', { name: 'Адрес' });
  expect(address).toHaveAttribute('aria-invalid', 'true');
  expect(address).toHaveAccessibleDescription('Укажите номер дома Улица и дом');
  await user.type(address, 'Лесной, 10');
  expect(address).toHaveValue('Лесной, 10');
  await user.tab();
  const comment = screen.getByRole('textbox', { name: 'Комментарий' });
  expect(comment).toHaveFocus();
  expect(comment).toHaveAccessibleDescription('Важные детали');
  expect(screen.getByRole('textbox', { name: 'Заблокированное поле' })).toBeDisabled();
});

test('выбор площадки и параметры доступны с клавиатуры', async () => {
  const user = userEvent.setup();
  render(
    <TestProvider>
      <Select label="Тип сделки" data={['Продажа', 'Аренда']} />
      <Checkbox label="Авито" />
      <Switch label="Сохранять черновик" />
      <Checkbox label="Недоступная площадка" disabled />
    </TestProvider>,
  );
  await user.tab();
  expect(screen.getByRole('combobox', { name: 'Тип сделки' })).toHaveFocus();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(screen.getByRole('combobox', { name: 'Тип сделки' })).toHaveValue('Продажа');
  await user.tab();
  await user.keyboard(' ');
  expect(screen.getByRole('checkbox', { name: 'Авито' })).toBeChecked();
  await user.tab();
  await user.keyboard(' ');
  expect(screen.getByRole('switch', { name: 'Сохранять черновик' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Недоступная площадка' })).toBeDisabled();
});

describe('уведомления', () => {
  for (const tone of ['success', 'error', 'warning', 'info', 'loading'] as const) {
    test(`${tone} сообщает состояние и закрывается доступной кнопкой`, async () => {
      const user = userEvent.setup();
      function Notice() {
        const [visible, setVisible] = useState(true);
        return visible && <AppNotice tone={tone} title="Результат сохранения" onClose={() => setVisible(false)}>Проверьте объявление</AppNotice>;
      }
      render(<TestProvider><Notice /></TestProvider>);
      const notice = screen.getByRole(tone === 'error' ? 'alert' : 'status');
      expect(within(notice).getByText('Проверьте объявление')).toBeVisible();
      expect(notice).toHaveAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
      if (tone === 'loading') expect(notice).toHaveAttribute('aria-busy', 'true');
      await user.click(within(notice).getByRole('button', { name: 'Закрыть уведомление «Результат сохранения»' }));
      expect(screen.queryByText('Результат сохранения')).not.toBeInTheDocument();
    });
  }

  test('постоянное уведомление не показывает закрытие, загрузка имеет текст', () => {
    render(<TestProvider><AppNotice tone="info" title="Нет соединения" /><LoadingState /><LoadingState label="Готовим фотографии" /></TestProvider>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Загружаем')).toBeVisible();
    expect(screen.getByText('Готовим фотографии')).toBeVisible();
  });
});

for (const variant of ['user', 'admin'] as const) {
  test(`шапка ${variant} открывает меню, возвращает фокус и вызывает выход`, async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    render(
      <TestProvider><PageLayout header={{ variant, userName: 'Захар', listingsHref: '/listings', channelsHref: '/channels', onLogout, currentSection: 'channels' }}>
        <h1>Рабочая страница</h1>
      </PageLayout></TestProvider>,
    );
    expect(screen.getAllByText('Докрутка объявления')).toHaveLength(1);
    const account = await screen.findByRole('button', { name: 'Меню пользователя: Захар' });
    account.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitem', { name: 'Мои объявления' });
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Мои объявления' })).toHaveAttribute('href', '/listings');
    if (variant === 'admin') {
      expect(within(menu).getByRole('menuitem', { name: 'Площадки' })).toHaveAttribute('href', '/channels');
      expect(screen.getByRole('link', { name: 'Площадки' })).toHaveAttribute('aria-current', 'page');
    } else {
      expect(within(menu).queryByRole('menuitem', { name: 'Площадки' })).not.toBeInTheDocument();
    }
    await user.keyboard('{Escape}');
    expect(account).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
}

test('администратор может обозначить текущую страницу объявлений', async () => {
  render(<TestProvider><PageLayout header={{ variant: 'admin', userName: 'Захар', listingsHref: '/listings', channelsHref: '/channels', currentSection: 'listings', onLogout: vi.fn() }}><h1>Объявления</h1></PageLayout></TestProvider>);
  expect(await screen.findByRole('link', { name: 'Мои объявления' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Площадки' })).not.toHaveAttribute('aria-current');
});

test('главная передаёт действие начала работы в шапку и основную кнопку', async () => {
  const user = userEvent.setup();
  const onStart = vi.fn();
  render(<TestProvider><HomePage onStart={onStart} /></TestProvider>);
  for (const button of screen.getAllByRole('button', { name: 'Начать работу' })) await user.click(button);
  expect(onStart).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Вход скоро появится')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'К содержимому' })).toHaveAttribute('href', '#main-content');
});
