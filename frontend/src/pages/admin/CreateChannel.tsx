import { Paper, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { adminChannelSettingsPath, navigate } from '../../app/navigation';
import { adminChannels } from '../../shared/api/admin-channels';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import classes from './Channels.module.css';

function readLimit(value: string) {
  if (!value.trim()) return null;
  return /^\d+$/.test(value.trim()) ? Number(value) : NaN;
}

function validateLimit(value: string) {
  const limit = readLimit(value);
  return limit === null || (Number.isSafeInteger(limit) && limit > 0) ? null : 'Введите целое число больше нуля';
}

function fieldFor(pointer: string, ruleCount: number) {
  switch (pointer) {
    case '/name': return 'name';
    case '/description': return 'description';
    case '/instruction': return 'instruction';
    case '/isActive': return 'isActive';
    case '/limits':
    case '/limits/titleLimit': return 'titleLimit';
    case '/limits/textLimit': return 'textLimit';
    case '/checklist': return 'checklist.0.text';
    default: {
      const index = /^\/checklist\/(0|[1-9]\d*)$/.exec(pointer)?.[1];
      return index !== undefined && Number(index) < ruleCount ? `checklist.${index}.text` : undefined;
    }
  }
}

export function CreateChannel({ onAccessError }: { onAccessError: (error: unknown) => void }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; message?: string; field?: string }>();
  const submission = useRef<AbortController | null>(null);
  const nextRuleId = useRef(1);
  const form = useForm({
    initialValues: {
      name: '', description: '', titleLimit: '', textLimit: '', instruction: '',
      checklist: [{ id: 0, text: '' }], isActive: true,
    },
    validate: {
      name: (value) => value.trim() ? null : 'Введите название площадки',
      titleLimit: validateLimit,
      textLimit: validateLimit,
      instruction: (value) => value.trim() ? null : 'Введите системный промпт',
      checklist: { text: (value) => value.trim() ? null : 'Введите текст правила' },
    },
    onValuesChange: () => setFeedback(undefined),
  });
  const { getInputNode } = form;

  useEffect(() => () => submission.current?.abort(), []);
  useEffect(() => {
    if (!pending && feedback?.field) getInputNode(feedback.field)?.focus();
  }, [feedback, getInputNode, pending]);

  const submitChannel = async ({ name, description, titleLimit, textLimit, instruction, checklist, isActive }: typeof form.values) => {
    const controller = new AbortController();
    submission.current = controller;
    setPending(true);
    setFeedback(undefined);
    try {
      const channel = await adminChannels.create({
        name: name.trim(), description: description.trim(), instruction: instruction.trim(),
        limits: { titleLimit: readLimit(titleLimit), textLimit: readLimit(textLimit) },
        checklist: checklist.map(({ text }) => text.trim()), isActive,
      }, controller.signal);
      if (!controller.signal.aborted) navigate(adminChannelSettingsPath(channel.id), true);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && error.status === 409) {
        form.setFieldError('name', 'Площадка с таким названием уже есть');
        setFeedback({ title: 'Название уже занято', message: 'Введите другое название площадки', field: 'name' });
      } else if (error instanceof RequestError && (error.status === 400 || error.status === 422)) {
        const errors: Record<string, string> = {};
        for (const issue of error.fieldErrors ?? []) {
          const field = fieldFor(issue.field, checklist.length);
          if (field) errors[field] ??= issue.message;
        }
        form.setErrors(errors);
        setFeedback({ title: 'Проверьте данные площадки', message: Object.keys(errors).length ? 'Исправьте отмеченные поля' : 'Сервер отклонил данные. Проверьте форму и повторите отправку.', field: Object.keys(errors)[0] });
      } else {
        setFeedback({ title: 'Не удалось создать площадку', message: error instanceof RequestError ? error.message : 'Попробуйте ещё раз.' });
        onAccessError(error);
      }
    } finally {
      if (!controller.signal.aborted) {
        submission.current = null;
        setPending(false);
      }
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submission.current) return;
    return form.onSubmit(submitChannel, (errors) => {
      setFeedback({ title: 'Проверьте данные площадки', message: 'Исправьте отмеченные поля', field: Object.keys(errors)[0] });
    })(event);
  };

  return (
    <Paper className={classes.form}>
      <form onSubmit={submit} noValidate aria-label="Создание площадки" aria-busy={pending}>
        <fieldset className={classes.fields} disabled={pending}>
          <Stack gap="md">
            {feedback && <AppNotice tone="error" title={feedback.title}>{feedback.message}</AppNotice>}
            <TextInput label="Название" placeholder="Например, Авито" required {...form.getInputProps('name')} />
            <Textarea label="Описание" placeholder="Для каких объявлений подходит площадка" {...form.getInputProps('description')} />
            <Switch label="Площадка включена" description="Включённая площадка доступна для новых генераций" {...form.getInputProps('isActive', { type: 'checkbox' })} />
            <Title order={2} size="h3">Ограничения длины</Title>
            <TextInput label="Максимум символов в заголовке" placeholder="Не задано" inputMode="numeric" {...form.getInputProps('titleLimit')} />
            <TextInput label="Максимум символов в тексте" placeholder="Не задано" inputMode="numeric" {...form.getInputProps('textLimit')} />
            <Text size="sm" c="dimmed">Оставьте поле пустым, если ограничения нет</Text>
            <Textarea label="Системный промпт" placeholder="Опишите, как подготовить текст для площадки" minRows={6} required {...form.getInputProps('instruction')} />
            <Title order={2} size="h3">Чек-лист правил</Title>
            <Text size="sm" c="dimmed">Добавьте хотя бы одно правило</Text>
            {form.values.checklist.map(({ id }, index, rules) => (
              <Paper key={id} p="md">
                <Stack gap="sm" align="stretch">
                  <TextInput label={`Правило ${index + 1}`} placeholder="Например, используйте только подтверждённые факты" required {...form.getInputProps(`checklist.${index}.text`)} />
                  {rules.length > 1 && <div><AppButton intent="quiet" aria-label={`Удалить правило ${index + 1}`} onClick={() => form.removeListItem('checklist', index)}>Удалить правило</AppButton></div>}
                </Stack>
              </Paper>
            ))}
            <div><AppButton intent="secondary" onClick={() => form.insertListItem('checklist', { id: nextRuleId.current++, text: '' })}>Добавить правило</AppButton></div>
            <div><AppButton type="submit" loading={pending}>{pending ? 'Создаём площадку…' : 'Создать площадку'}</AppButton></div>
          </Stack>
        </fieldset>
      </form>
    </Paper>
  );
}
