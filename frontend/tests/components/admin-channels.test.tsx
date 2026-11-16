import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/app/App';
import { navigate } from '../../src/app/navigation';

const api = '/api/v1/admin/channels';
const user = { id: '9a07b31d-ac15-495c-bb91-e3756fe40bcc', login: 'admin_demo', role: 'admin' };
const channel = {
  id: '0845e7a8-73b7-4c04-a0f3-7d24817970bb', number: 1, name: 'Авито', description: '', isActive: true,
  instruction: 'Укажи условия сделки.', checklist: ['Проверь цену.'], limits: { titleLimit: null, textLimit: null },
};
const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const adminCalls = () => fetchMock.mock.calls.filter(([url]) => url === api);

beforeEach(() => vi.stubGlobal('fetch', fetchMock));
afterEach(() => { fetchMock.mockReset(); vi.unstubAllGlobals(); navigate('/'); });

test('401 списка перепроверяет сессию, после отзыва роли список скрыт', async () => {
  let sessions = 0;
  fetchMock.mockImplementation(async (url) => {
    if (url === '/api/v1/auth/me') return json({ user: { ...user, role: sessions++ === 0 ? 'admin' : 'agent' } });
    expect(url).toBe(api);
    return json({}, 401);
  });
  navigate('/admin/channels');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Доступ ограничен' })).toBeVisible();
  expect(screen.queryByRole('list', { name: 'Список площадок' })).not.toBeInTheDocument();
  expect(adminCalls()).toHaveLength(1);
  expect(sessions).toBe(2);
});

test('некорректный ответ со списком отклоняется, повтор показывает валидную площадку', async () => {
  fetchMock.mockImplementation(async (url) => {
    if (url === '/api/v1/auth/me') return json({ user });
    expect(url).toBe(api);
    return json({ items: adminCalls().length === 1 ? [{ ...channel, limits: { ...channel.limits, textLimit: 0 } }] : [channel] });
  });
  navigate('/admin/channels');
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Сервер вернул неожиданный ответ');
  expect(screen.queryByText(channel.name)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(await screen.findByRole('heading', { name: channel.name })).toBeVisible();
});

test('дробный лимит блокирует отправку, повторный submit не дублирует POST, уход отменяет ожидание', async () => {
  let finish!: (response: Response) => void;
  fetchMock.mockImplementation(async (url, options) => {
    if (url === '/api/v1/auth/me') return json({ user });
    expect(url).toBe(api);
    if (options?.method === 'POST') return await new Promise((resolve) => { finish = resolve; });
    return json({ items: [] });
  });
  navigate('/admin/channels/new');
  render(<App />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Название' }), { target: { value: channel.name } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Системный промпт' }), { target: { value: channel.instruction } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Правило 1' }), { target: { value: channel.checklist[0] } });
  const form = screen.getByRole('form', { name: 'Создание площадки' });
  const limit = screen.getByRole('textbox', { name: 'Максимум символов в тексте' });
  fireEvent.change(limit, { target: { value: '1.5' } });
  fireEvent.submit(form);
  expect(limit).toHaveAccessibleDescription('Введите целое число больше нуля');
  expect(adminCalls()).toHaveLength(0);

  fireEvent.change(limit, { target: { value: '' } });
  fireEvent.submit(form);
  fireEvent.submit(form);
  const post = adminCalls().filter(([, options]) => options?.method === 'POST');
  expect(post).toHaveLength(1);
  const signal = post[0]?.[1]?.signal;
  await userEvent.click(screen.getByRole('button', { name: '← Площадки' }));
  expect(signal?.aborted).toBe(true);
  await act(async () => finish(json(channel, 201)));
  await waitFor(() => expect(screen.getByText('Пока нет площадок')).toBeVisible());
  expect(window.location.pathname).toBe('/admin/channels');
});
