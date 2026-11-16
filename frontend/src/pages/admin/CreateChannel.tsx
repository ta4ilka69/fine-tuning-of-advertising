import { Paper, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { adminChannelSettingsPath, navigate } from '../../app/navigation';
import { adminChannels } from '../../shared/api/admin-channels';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import classes from './Channels.module.css';

const initialValues = {
  name: '', description: '', titleLimit: '', textLimit: '', instruction: '',
  checklist: [{ id: 0, text: '' }], isActive: true,
};

type Feedback = { title: string; message?: string; field?: string };
export type ChannelDraft = { values: typeof initialValues; accessError?: 401 | 403 };

const accessFeedback: Record<401 | 403, Feedback> = {
  401: { title: 'Не удалось создать площадку', message: 'Повторите отправку формы после проверки сессии' },
  403: { title: 'Не удалось создать площадку', message: 'Сервер отклонил запрос на создание площадки' },
};

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

export function CreateChannel({ draft, onDraftChange, restore }: {
  draft?: ChannelDraft;
  onDraftChange: (draft: ChannelDraft) => void;
  restore: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState(() => draft?.accessError ? accessFeedback[draft.accessError] : undefined);
  const submission = useRef<AbortController | null>(null);
  const nextRuleId = useRef(draft?.values.checklist.reduce((next, { id }) => Math.max(next, id + 1), 1) ?? 1);
  const ruleFocus = useRef<number | undefined>(undefined);
  const feedbackTarget = useRef<HTMLDivElement>(null);
  const form = useForm({
    initialValues: draft?.values ?? initialValues,
    validate: {
      name: (value) => value.trim() ? null : 'Введите название площадки',
      titleLimit: validateLimit,
      textLimit: validateLimit,
      instruction: (value) => value.trim() ? null : 'Введите системный промпт',
      checklist: { text: (value) => value.trim() ? null : 'Введите текст правила' },
    },
    onValuesChange: (values) => { setFeedback(undefined); onDraftChange({ values }); },
  });
  const getInputNode = useEffectEvent(form.getInputNode);
  const ruleCount = form.values.checklist.length;

  useLayoutEffect(() => () => submission.current?.abort(), []);
  useEffect(() => {
    if (pending || !feedback) return;
    const field = feedback.field ? getInputNode(feedback.field) : null;
    (field ?? feedbackTarget.current)?.focus();
  }, [feedback, pending]);
  useEffect(() => {
    if (ruleFocus.current === undefined) return;
    getInputNode(`checklist.${ruleFocus.current}.text`)?.focus();
    ruleFocus.current = undefined;
  }, [ruleCount]);

  const submitChannel = async (values: typeof initialValues) => {
    const { name, description, titleLimit, textLimit, instruction, checklist, isActive } = values;
    const controller = new AbortController();
    submission.current = controller;
    onDraftChange({ values });
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
      } else if (error instanceof RequestError && (error.status === 401 || error.status === 403)) {
        const accessError = error.status;
        onDraftChange({ values, accessError });
        setFeedback(accessFeedback[accessError]);
        void restore();
      } else {
        setFeedback({ title: 'Не удалось создать площадку', message: error instanceof RequestError ? error.message : 'Попробуйте ещё раз.' });
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
            {feedback && <div ref={feedbackTarget} tabIndex={-1}><AppNotice tone="error" title={feedback.title}>{feedback.message}</AppNotice></div>}
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
            {form.values.checklist.map(({ id }, index) => (
              <Paper key={id} p="md">
                <Stack gap="sm" align="stretch">
                  <TextInput label={`Правило ${index + 1}`} placeholder="Например, используйте только подтверждённые факты" required {...form.getInputProps(`checklist.${index}.text`)} />
                  {ruleCount > 1 && <div><AppButton intent="quiet" aria-label={`Удалить правило ${index + 1}`} onClick={() => {
                    ruleFocus.current = Math.min(index, ruleCount - 2);
                    form.removeListItem('checklist', index);
                  }}>Удалить правило</AppButton></div>}
                </Stack>
              </Paper>
            ))}
            <div><AppButton intent="secondary" onClick={() => {
              ruleFocus.current = ruleCount;
              form.insertListItem('checklist', { id: nextRuleId.current++, text: '' });
            }}>Добавить правило</AppButton></div>
            <div><AppButton type="submit" loading={pending}>{pending ? 'Создаём площадку…' : 'Создать площадку'}</AppButton></div>
          </Stack>
        </fieldset>
      </form>
    </Paper>
  );
}
