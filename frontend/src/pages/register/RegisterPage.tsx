import { Anchor, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { actionError } from '../../features/session/actionError';
import classes from '../../features/session/AuthPage.module.css';
import { useSession } from '../../features/session/context';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { PageLayout } from '../../shared/ui/PageLayout';
import { validateLogin, validatePassword } from './validation';

export default function RegisterPage() {
  const { register } = useSession();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ title: string; description?: string; field?: 'login' | 'password' }>();
  const submitting = useRef(false);
  const loginInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const form = useForm({
    initialValues: { login: '', password: '' },
    validate: { login: validateLogin, password: validatePassword },
  });

  useEffect(() => {
    if (!pending && error?.field) (error.field === 'login' ? loginInput : passwordInput).current?.focus();
  }, [error, pending]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    void form.onSubmit(async (values) => {
      submitting.current = true;
      setPending(true);
      setError(undefined);
      try {
        await register(values);
      } catch (failure) {
        if (failure instanceof RequestError && failure.status === 409) {
          form.setFieldError('login', 'Этот логин уже занят');
          setError({ title: 'Логин уже занят', description: 'Выберите другой логин.', field: 'login' });
        } else {
          let field: 'login' | 'password' | undefined;
          if (failure instanceof RequestError && (failure.status === 400 || failure.status === 422)) {
            const issues = failure.fieldErrors ?? [];
            const invalidLogin = issues.some((issue) => issue.field === '/login');
            const invalidPassword = issues.some((issue) => issue.field === '/password');
            if (invalidLogin) form.setFieldError('login', 'Проверьте логин');
            if (invalidPassword) form.setFieldError('password', 'Проверьте пароль');
            field = invalidLogin ? 'login' : invalidPassword ? 'password' : undefined;
          }
          setError({ title: actionError(failure), field });
        }
      } finally {
        submitting.current = false;
        setPending(false);
      }
    }, (errors) => {
      setError({ title: 'Проверьте поля', description: 'Исправьте отмеченные значения перед отправкой.', field: errors.login ? 'login' : 'password' });
    })(event);
  };

  return (
    <PageLayout header={{ variant: 'guest' }} className={classes.main}>
      <Paper component="section" className={classes.card} aria-labelledby="register-title">
        <Stack gap="md">
          <Title order={1} id="register-title" size="h2">Создать аккаунт</Title>
          <Text c="dimmed">После регистрации можно сразу создать объявление</Text>
          <form onSubmit={submit} noValidate aria-label="Регистрация аккаунта" aria-busy={pending}>
            <Stack gap="md">
              <TextInput ref={loginInput} label="Логин" description="3–32 символа: латиница, цифры, точка, дефис и _. Регистр не важен" placeholder="Ваш логин" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required withAsterisk={false} disabled={pending} {...form.getInputProps('login')} />
              <TextInput id="register-password" ref={passwordInput} label="Пароль" description="От 12 до 128 символов" placeholder="Ваш пароль" name="password" type={visible ? 'text' : 'password'} autoComplete="new-password" required withAsterisk={false} disabled={pending} {...form.getInputProps('password')} />
              <AppButton intent="quiet" aria-pressed={visible} aria-controls="register-password" disabled={pending} onClick={() => setVisible(!visible)}>
                {visible ? 'Скрыть пароль' : 'Показать пароль'}
              </AppButton>
              {error && <AppNotice tone="error" title={error.title}>{error.description}</AppNotice>}
              <AppButton type="submit" fullWidth loading={pending}>{pending ? 'Регистрируем…' : 'Зарегистрироваться'}</AppButton>
            </Stack>
          </form>
          <Text role="status" className={classes.status}>{pending ? 'Создаём аккаунт' : ''}</Text>
          <Text size="sm" c="dimmed" ta="center">Уже есть аккаунт? <Anchor href="/login" size="sm" underline="always">Войти</Anchor></Text>
          <Text size="xs" c="dimmed">Вы получите обычный аккаунт пользователя</Text>
        </Stack>
      </Paper>
    </PageLayout>
  );
}
