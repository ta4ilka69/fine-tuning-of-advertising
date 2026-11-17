import { Modal, Paper, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { adminChannelsPath, navigate } from '../../app/navigation';
import { useUnsavedChanges } from '../../features/listing-form/use-unsaved-changes';
import { adminChannels, type AdminChannel } from '../../shared/api/admin-channels';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { ChannelRulesFields } from './ChannelRulesFields';
import { channelSettingsField, channelRulesValidation, readLimit, validateLimit, type ChannelRulesValues } from './channel-rules';
import classes from './Channels.module.css';

type Feedback = { tone: 'error' | 'success'; title: string; message: string; field?: string; retry?: boolean };
type ChannelFields = {
  name: string;
  description: string;
  titleLimit: string;
  textLimit: string;
  isActive: boolean;
};
type ChannelSettingsValues = ChannelFields & ChannelRulesValues;
type ChannelDraft = ChannelFields & Pick<AdminChannel, 'instruction' | 'checklist'>;
type DraftCopy = { version: number; draft: ChannelDraft };

function getDraft({ checklist, ...fields }: ChannelSettingsValues): ChannelDraft {
  return { ...fields, checklist: checklist.map(({ text }) => text) };
}

function channelDraft(channel: AdminChannel): ChannelDraft {
  return {
    name: channel.name, description: channel.description, isActive: channel.isActive,
    titleLimit: channel.limits.titleLimit?.toString() ?? '',
    textLimit: channel.limits.textLimit?.toString() ?? '',
    instruction: channel.instruction, checklist: channel.checklist,
  };
}

function sameDraft(a: ChannelDraft, b: ChannelDraft) {
  return a.name === b.name && a.description === b.description && a.isActive === b.isActive
    && a.titleLimit === b.titleLimit && a.textLimit === b.textLimit
    && a.instruction === b.instruction && a.checklist.length === b.checklist.length
    && a.checklist.every((text, index) => text === b.checklist[index]);
}

function localCopy({ name, description, isActive, titleLimit, textLimit, instruction, checklist }: ChannelDraft) {
  return [
    'Название', name, '', 'Описание', description, '', isActive ? 'Площадка включена' : 'Площадка выключена', '',
    `Максимум символов в заголовке: ${titleLimit || 'Не задано'}`,
    `Максимум символов в тексте: ${textLimit || 'Не задано'}`, '',
    'Системный промпт', instruction, '', 'Чек-лист правил',
    ...checklist.map((text, index) => `${index + 1}. ${text.replace(/\r\n?|\n/g, '\n   ')}`)].join('\n');
}

export function ChannelSettings({ id, suspended, recheckSession, onDenied }: {
  id: string;
  suspended: boolean;
  recheckSession: () => void;
  onDenied: () => void;
}) {
  const [channel, setChannel] = useState<AdminChannel | null>();
  const [reading, setReading] = useState<'initial' | 'reload' | null>('initial');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>();
  const [conflict, setConflict] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copies, setCopies] = useState<DraftCopy[]>([]);
  const [shownCopy, setShownCopy] = useState<string>();
  const active = useRef<AbortController | null>(null);
  const dirty = useRef(false);
  const focusAfterReload = useRef(false);
  const settingsTitle = useRef<HTMLHeadingElement>(null);
  const feedbackTarget = useRef<HTMLDivElement>(null);
  const conflictTarget = useRef<HTMLDivElement>(null);
  const missingTarget = useRef<HTMLDivElement>(null);
  const pending = Boolean(reading) || saving;
  const form = useForm<ChannelSettingsValues>({
    initialValues: { name: '', description: '', titleLimit: '', textLimit: '', isActive: true, instruction: '', checklist: [] },
    validate: {
      name: (value) => value.trim() ? null : 'Введите название площадки',
      titleLimit: validateLimit,
      textLimit: validateLimit,
      ...channelRulesValidation,
    },
    onValuesChange: () => setFeedback(undefined),
  });
  const getInputNode = useEffectEvent(form.getInputNode);
  const values = form.values;
  useUnsavedChanges(dirty);
  useLayoutEffect(() => {
    dirty.current = (channel != null && !sameDraft(getDraft(values), channelDraft(channel)))
      || copies.some(({ draft }) => !channel || !sameDraft(draft, channelDraft(channel)));
  }, [channel, copies, values]);

  const preserveDraft = (draft: ChannelDraft, source: AdminChannel) => {
    if (sameDraft(draft, channelDraft(source))) return;
    setCopies((previous) => previous.some((copy) => sameDraft(copy.draft, draft))
      ? previous : [...previous, { version: source.number, draft }]);
  };

  const applyChannel = (current: AdminChannel) => {
    setChannel(current);
    form.setValues({
      ...channelDraft(current),
      checklist: current.checklist.map((text, index) => ({ id: index, text })),
    });
    form.clearErrors();
  };

  const acceptRead = useEffectEvent((items: AdminChannel[], replacing: boolean) => {
    if (replacing && channel) preserveDraft(getDraft(form.getValues()), channel);
    const current = items.find((item) => item.id.toLowerCase() === id.toLowerCase());
    if (current) {
      focusAfterReload.current = replacing;
      applyChannel(current);
    } else {
      setChannel(null);
    }
    setConflict(false);
  });
  const rejectRead = useEffectEvent((error: unknown, replacing: boolean) => {
    if (error instanceof RequestError) {
      if (error.status === 403) {
        onDenied();
        return;
      }
      if (error.status === 401) recheckSession();
    }
    setFeedback({
      tone: 'error',
      title: replacing ? 'Не удалось загрузить актуальную версию' : 'Не удалось загрузить настройки',
      message: replacing ? 'Ваши правки остались в форме. Повторите загрузку.' : error instanceof RequestError ? error.message : 'Попробуйте ещё раз.',
    });
  });

  useLayoutEffect(() => {
    if (!reading) return;
    const controller = new AbortController();
    void adminChannels.list(controller.signal).then((items) => {
      if (!controller.signal.aborted) acceptRead(items, reading === 'reload');
    }, (error: unknown) => {
      if (!controller.signal.aborted) rejectRead(error, reading === 'reload');
    }).finally(() => {
      if (!controller.signal.aborted) setReading(null);
    });
    return () => controller.abort();
  }, [reading]);

  const load = (replacing = false) => {
    if (pending || active.current) return;
    setReading(replacing ? 'reload' : 'initial');
    setFeedback(undefined);
    setConfirm(false);
  };
  useLayoutEffect(() => () => {
    active.current?.abort();
    dirty.current = false;
  }, []);
  useEffect(() => {
    if (pending || suspended) return;
    if (feedback) {
      const field = feedback.field ? getInputNode(feedback.field) : null;
      (field ?? feedbackTarget.current)?.focus();
    } else if (focusAfterReload.current) {
      focusAfterReload.current = false;
      settingsTitle.current?.focus();
    }
  }, [feedback, pending, suspended]);
  useEffect(() => { if (conflict) conflictTarget.current?.focus(); }, [conflict]);
  useEffect(() => { if (channel === null) missingTarget.current?.focus(); }, [channel]);

  const save = async (values: ChannelSettingsValues) => {
    if (!channel || conflict || reading || active.current) return;
    const controller = new AbortController();
    const draft = getDraft(values);
    active.current = controller;
    setSaving(true);
    setFeedback(undefined);
    try {
      const current = await adminChannels.update(channel.id, {
        name: draft.name.trim(), description: draft.description.trim(), isActive: draft.isActive,
        limits: { titleLimit: readLimit(draft.titleLimit), textLimit: readLimit(draft.textLimit) },
        instruction: draft.instruction, checklist: draft.checklist, expectedNumber: channel.number,
      }, controller.signal);
      if (controller.signal.aborted) return;
      applyChannel(current);
      setFeedback({ tone: 'success', title: 'Настройки сохранены', message: 'Новые правила применятся к следующим запускам' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && (error.status === 401 || error.status === 403)) recheckSession();
      if (error instanceof RequestError && error.status === 409 && error.problem?.code === 'CHANNEL_NAME_TAKEN') {
        form.setFieldError('name', 'Площадка с таким названием уже есть');
        setFeedback({ tone: 'error', title: 'Название уже занято', message: 'Введите другое название площадки', field: 'name' });
      } else if (error instanceof RequestError && error.status === 409) {
        setConflict(true);
      } else if (error instanceof RequestError && error.status === 404) {
        preserveDraft(draft, channel);
        setChannel(null);
      } else if (error instanceof RequestError && (error.status === 400 || error.status === 422)) {
        const errors: Record<string, string> = {};
        const otherErrors: string[] = [];
        for (const issue of error.fieldErrors ?? []) {
          const field = channelSettingsField(issue.field, draft.checklist.length);
          if (field) errors[field] ??= issue.message;
          else otherErrors.push(issue.message);
        }
        form.setErrors(errors);
        const field = Object.keys(errors)[0];
        setFeedback({
          tone: 'error', title: 'Проверьте настройки площадки', field,
          message: [field ? 'Исправьте отмеченные поля' : '', ...new Set(otherErrors)].filter(Boolean).join('. ')
            || error.problem?.title || 'Проверьте форму и повторите сохранение',
        });
      } else {
        setFeedback({
          tone: 'error', title: 'Не удалось сохранить настройки',
          message: error instanceof RequestError ? error.message : 'Попробуйте ещё раз.', retry: true,
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        active.current = null;
        setSaving(false);
      }
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || active.current || conflict) return;
    return form.onSubmit(save, (errors) => {
      setFeedback({ tone: 'error', title: 'Проверьте настройки площадки', message: 'Исправьте отмеченные поля', field: Object.keys(errors)[0] });
    })(event);
  };

  if (suspended) return null;

  const notice = feedback && <div ref={feedbackTarget} tabIndex={-1}>
    <AppNotice tone={feedback.tone} title={feedback.title}>
      <Stack gap="sm" align="flex-start">
        <Text>{feedback.message}</Text>
        {feedback.retry && <AppButton type="submit" intent="secondary">Повторить</AppButton>}
        {channel === undefined && <AppButton onClick={() => load()}>Повторить</AppButton>}
      </Stack>
    </AppNotice>
  </div>;

  return (
    <Stack gap="md" align="flex-start">
      <AppButton intent="quiet" onClick={() => navigate(adminChannelsPath)}>← Площадки</AppButton>
      <Title order={1} className={classes.settingsTitle} ref={settingsTitle} tabIndex={-1}>{channel ? `Настройки: ${channel.name}` : 'Настройки площадки'}</Title>
      {channel === undefined && (notice ?? <AppNotice tone="loading" title="Загружаем настройки" />)}
      {channel === null && <div ref={missingTarget} tabIndex={-1}>
        <AppNotice tone="info" title="Площадка не найдена">Откройте список площадок, чтобы выбрать другую</AppNotice>
      </div>}
      {copies.length > 0 && <AppButton intent="quiet" disabled={pending} onClick={() => {
        setShownCopy(copies.map(({ version, draft }) => `Правки к версии ${version}\n\n${localCopy(draft)}`).join('\n\n'));
      }}>Открыть сохранённые правки</AppButton>}
      {channel && <Paper className={classes.form}>
        <form onSubmit={submit} noValidate aria-label="Настройки площадки" aria-busy={pending}>
          <Stack gap="md">
            {conflict && <div ref={conflictTarget} tabIndex={-1}>
              <AppNotice tone="warning" title="Настройки изменились">
                <Stack gap="sm" align="flex-start">
                  <Text>Ваши правки остались в&nbsp;форме. Загрузите актуальную версию перед новым сохранением.</Text>
                  <AppButton intent="secondary" loading={reading === 'reload'} onClick={() => setConfirm(true)}>Загрузить актуальную версию</AppButton>
                  <AppButton intent="quiet" disabled={pending} onClick={() => setShownCopy(localCopy(getDraft(form.getValues())))}>Посмотреть мои правки</AppButton>
                </Stack>
              </AppNotice>
            </div>}
            {notice}
            <fieldset className={classes.fields} disabled={pending}>
              <Stack gap="md">
                <Text size="sm" c="dimmed">Версия {channel.number}</Text>
                <TextInput label="Название" required {...form.getInputProps('name')} />
                <Textarea label="Описание" {...form.getInputProps('description')} autosize minRows={1} maxRows={6} classNames={{ input: classes.compactTextarea }} />
                <Switch label="Площадка включена" description="Включённая площадка доступна для новых генераций" {...form.getInputProps('isActive', { type: 'checkbox' })} />
                <Title order={2} size="h3">Ограничения длины</Title>
                <TextInput label="Максимум символов в заголовке" placeholder="Не задано" inputMode="numeric" {...form.getInputProps('titleLimit')} />
                <TextInput label="Максимум символов в тексте" placeholder="Не задано" inputMode="numeric" {...form.getInputProps('textLimit')} />
                <ChannelRulesFields form={form} reorder />
                <div><AppButton type="submit" disabled={conflict} loading={saving}>
                  {saving ? 'Сохраняем настройки…' : 'Сохранить настройки'}
                </AppButton></div>
                <Text size="sm" c="dimmed">Уже запущенные генерации используют прежние настройки</Text>
              </Stack>
            </fieldset>
          </Stack>
        </form>
      </Paper>}
      <Modal opened={confirm} onClose={() => setConfirm(false)} title="Загрузить актуальную версию?" centered
        attributes={{ header: { role: 'presentation' } }} closeButtonProps={{ 'aria-label': 'Закрыть подтверждение' }}>
        <Stack>
          <Text>Новая версия заменит данные в&nbsp;форме. Несохранённые правки можно будет открыть на&nbsp;этой странице.</Text>
          <AppButton onClick={() => load(true)}>Загрузить и&nbsp;заменить форму</AppButton>
          <AppButton intent="secondary" onClick={() => setConfirm(false)}>Вернуться к&nbsp;форме</AppButton>
        </Stack>
      </Modal>
      <Modal opened={shownCopy !== undefined} onClose={() => setShownCopy(undefined)} title="Мои правки" centered
        attributes={{ header: { role: 'presentation' } }} closeButtonProps={{ 'aria-label': 'Закрыть копию правок' }}>
        <Stack>
          <Textarea label="Сохранённый ввод" value={shownCopy ?? ''} readOnly autosize minRows={6} maxRows={12} />
          <Text size="sm" c="dimmed">Скопируйте нужный текст перед уходом со страницы</Text>
          <AppButton onClick={() => setShownCopy(undefined)}>Вернуться к&nbsp;форме</AppButton>
        </Stack>
      </Modal>
    </Stack>
  );
}
