import { Anchor, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { actionError } from '../../features/session/actionError';
import { useSession } from '../../features/session/context';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { PageLayout } from '../../shared/ui/PageLayout';
import classes from '../../features/session/AuthPage.module.css';

export default function LoginPage() {
  const { login } = useSession();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const loginInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const form = useForm({
    initialValues: { login: '', password: '' },
    validate: {
      login: (value) => value.trim().length ? null : 'Введите логин',
      password: (value) => value.length ? null : 'Введите пароль',
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    void form.onSubmit(async (values) => {
      if (submitting.current) return;
      submitting.current = true;
      setPending(true);
      setError(undefined);
      try {
        await login(values);
      } catch (failure) {
        if (failure instanceof RequestError && (failure.status === 400 || failure.status === 422)) {
          for (const issue of failure.fieldErrors ?? []) {
            if (issue.field === '/login') form.setFieldError('login', 'Проверьте логин');
            if (issue.field === '/password') form.setFieldError('password', 'Проверьте пароль');
          }
        }
        setError(actionError(failure));
      } finally {
        submitting.current = false;
        setPending(false);
      }
    }, (errors) => {
      setError(undefined);
      (errors.login ? loginInput : passwordInput).current?.focus();
    })(event);
  };

  return (
    <PageLayout header={{ variant: 'guest' }} className={classes.main}>
      <Paper component="section" className={classes.card} aria-labelledby="login-title">
        <Stack gap="md">
          <Title order={1} id="login-title" size="h2">С возвращением</Title>
          <Text c="dimmed">Войдите, чтобы продолжить работу с объявлениями</Text>
          <form onSubmit={submit} noValidate aria-label="Вход в аккаунт" aria-busy={pending}>
            <Stack gap="md">
              <TextInput ref={loginInput} label="Логин" placeholder="Ваш логин" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required withAsterisk={false} disabled={pending} {...form.getInputProps('login')} />
              <TextInput id="login-password" ref={passwordInput} label="Пароль" placeholder="Ваш пароль" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required withAsterisk={false} disabled={pending} {...form.getInputProps('password')} />
              <AppButton intent="quiet" aria-pressed={visible} aria-controls="login-password" disabled={pending} onClick={() => setVisible(!visible)}>
                {visible ? 'Скрыть пароль' : 'Показать пароль'}
              </AppButton>
              {error && <AppNotice tone="error" title={error} />}
              <AppButton type="submit" fullWidth loading={pending}>{pending ? 'Входим…' : 'Войти'}</AppButton>
              <Text role="status" className={classes.status}>{pending ? 'Проверяем логин и пароль' : ''}</Text>
            </Stack>
          </form>
          <Text size="sm" c="dimmed" ta="center">Нет аккаунта? <Anchor href="/register" size="sm" underline="always">Зарегистрироваться</Anchor></Text>
        </Stack>
      </Paper>
    </PageLayout>
  );
}
