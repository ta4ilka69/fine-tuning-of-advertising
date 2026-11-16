import { Modal, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { adminChannelsPath, navigate } from '../../app/navigation';
import { useUnsavedChanges } from '../../features/listing-form/use-unsaved-changes';
import { adminChannels, type AdminChannel } from '../../shared/api/admin-channels';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { ChannelRulesFields } from './ChannelRulesFields';
import { channelRuleField, channelRulesValidation, type ChannelRulesValues } from './channel-rules';
import classes from './Channels.module.css';

type Feedback = { tone: 'error' | 'success'; title: string; message: string; field?: string; retry?: boolean };
type ChannelRules = Pick<AdminChannel, 'instruction' | 'checklist'>;
type DraftCopy = { version: number; rules: ChannelRules };

function getRules({ instruction, checklist }: ChannelRulesValues): ChannelRules {
  return { instruction, checklist: checklist.map(({ text }) => text) };
}

function sameRules(a: ChannelRules, b: ChannelRules) {
  return a.instruction === b.instruction && a.checklist.length === b.checklist.length
    && a.checklist.every((text, index) => text === b.checklist[index]);
}

function localCopy({ instruction, checklist }: ChannelRules) {
  return ['Системный промпт', instruction, '', 'Чек-лист правил',
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
  const form = useForm<ChannelRulesValues>({
    initialValues: { instruction: '', checklist: [] },
    validate: channelRulesValidation,
    onValuesChange: () => setFeedback(undefined),
  });
  const getInputNode = useEffectEvent(form.getInputNode);
  const values = form.values;
  useUnsavedChanges(dirty);
  useLayoutEffect(() => {
    dirty.current = (channel != null && !sameRules(getRules(values), channel))
      || copies.some(({ rules }) => !channel || !sameRules(rules, channel));
  }, [channel, copies, values]);

  const preserveDraft = (rules: ChannelRules, source: AdminChannel) => {
    if (sameRules(rules, source)) return;
    setCopies((previous) => previous.some((copy) => sameRules(copy.rules, rules))
      ? previous : [...previous, { version: source.number, rules }]);
  };

  const applyChannel = (current: AdminChannel) => {
    setChannel(current);
    form.setValues({
      instruction: current.instruction,
      checklist: current.checklist.map((text, index) => ({ id: index, text })),
    });
    form.clearErrors();
  };

  const acceptRead = useEffectEvent((items: AdminChannel[], replacing: boolean) => {
    if (replacing && channel) preserveDraft(getRules(form.getValues()), channel);
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

  const save = async (draft: ChannelRulesValues) => {
    if (!channel || conflict || reading || active.current) return;
    const controller = new AbortController();
    const { name, description, limits, isActive, number } = channel;
    const rules = getRules(draft);
    active.current = controller;
    setSaving(true);
    setFeedback(undefined);
    try {
      const current = await adminChannels.update(channel.id, {
        name, description, limits, isActive, ...rules, expectedNumber: number,
      }, controller.signal);
      if (controller.signal.aborted) return;
      applyChannel(current);
      setFeedback({ tone: 'success', title: 'Настройки сохранены', message: 'Новые правила применятся к следующим запускам' });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof RequestError && (error.status === 401 || error.status === 403)) recheckSession();
      if (error instanceof RequestError && error.status === 409) {
        setConflict(true);
      } else if (error instanceof RequestError && error.status === 404) {
        preserveDraft(rules, channel);
        setChannel(null);
      } else if (error instanceof RequestError && (error.status === 400 || error.status === 422)) {
        const errors: Record<string, string> = {};
        const otherErrors: string[] = [];
        for (const issue of error.fieldErrors ?? []) {
          const field = channelRuleField(issue.field, rules.checklist.length);
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
        setShownCopy(copies.map(({ version, rules }) => `Правки к версии ${version}\n\n${localCopy(rules)}`).join('\n\n'));
      }}>Открыть сохранённые правки</AppButton>}
      {channel && <Paper className={classes.form}>
        <form onSubmit={submit} noValidate aria-label="Настройки площадки" aria-busy={pending}>
          <Stack gap="md">
            {conflict && <div ref={conflictTarget} tabIndex={-1}>
              <AppNotice tone="warning" title="Настройки изменились">
                <Stack gap="sm" align="flex-start">
                  <Text>Ваши правки остались в&nbsp;форме. Загрузите актуальную версию перед новым сохранением.</Text>
                  <AppButton intent="secondary" loading={reading === 'reload'} onClick={() => setConfirm(true)}>Загрузить актуальную версию</AppButton>
                  <AppButton intent="quiet" disabled={pending} onClick={() => setShownCopy(localCopy(getRules(form.getValues())))}>Посмотреть мои правки</AppButton>
                </Stack>
              </AppNotice>
            </div>}
            {notice}
            <fieldset className={classes.fields} disabled={pending}>
              <Stack gap="md">
                <Text size="sm" c="dimmed">Версия {channel.number}</Text>
                <TextInput label="Название" value={channel.name} readOnly />
                <Textarea label="Описание" value={channel.description} readOnly autosize minRows={1} maxRows={6} classNames={{ input: classes.compactTextarea }} />
                <div><span className={classes.badge} data-active={channel.isActive}>{channel.isActive ? 'Площадка включена' : 'Площадка выключена'}</span></div>
                <Title order={2} size="h3">Ограничения длины</Title>
                <TextInput label="Максимум символов в заголовке" value={channel.limits.titleLimit ?? 'Не задано'} readOnly />
                <TextInput label="Максимум символов в тексте" value={channel.limits.textLimit ?? 'Не задано'} readOnly />
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
