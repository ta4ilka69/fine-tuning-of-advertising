import { Group, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import type { GenerationResult } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { IconButton } from '../../shared/ui/IconButton';
import classes from './ListingResult.module.css';

type ChannelResult = GenerationResult['channels'][number];
type CopyField = 'title' | 'text';
type CopyFeedback = { field: CopyField; value: string; status: 'pending' | 'copied' | 'error' };

function ChannelTexts({ result }: { result: ChannelResult }) {
  const [feedback, setFeedback] = useState<CopyFeedback>();
  const titleButton = useRef<HTMLButtonElement>(null);
  const textButton = useRef<HTMLButtonElement>(null);
  const current = feedback && feedback.value === result[feedback.field] ? feedback : undefined;

  const copy = async (field: CopyField) => {
    const request: CopyFeedback = { field, value: result[field], status: 'pending' };
    setFeedback(request);
    let status: CopyFeedback['status'];
    try {
      await navigator.clipboard.writeText(request.value);
      status = 'copied';
    } catch {
      status = 'error';
    }
    setFeedback((latest) => latest === request ? { ...request, status } : latest);
  };

  return <Stack gap="md">
    {current?.status === 'error' && <AppNotice tone="error"
      title={current.field === 'title' ? 'Не удалось скопировать заголовок' : 'Не удалось скопировать текст'}>
      <Stack gap="sm" align="flex-start">
        <Text size="sm">Выделите нужный текст и скопируйте вручную: Ctrl+C или ⌘C.</Text>
        <AppButton intent="secondary" onClick={() => {
          (current.field === 'title' ? titleButton : textButton).current?.focus();
          void copy(current.field);
        }}>Повторить копирование</AppButton>
      </Stack>
    </AppNotice>}
    <div role="status" aria-atomic="true" className={classes.copied}>
      {current?.status === 'copied' && (current.field === 'title' ? 'Заголовок скопирован' : 'Текст скопирован')}
    </div>
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" fw={600}>Заголовок</Text>
      <IconButton ref={titleButton} intent="secondary" label="Копировать заголовок" onClick={() => { void copy('title'); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M6 16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
        </svg>
      </IconButton>
    </Group>
    <Title order={3} className={classes.title}>{result.title}</Title>
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" fw={600}>Текст объявления</Text>
      <AppButton ref={textButton} intent="secondary" onClick={() => { void copy('text'); }}>Копировать текст</AppButton>
    </Group>
    <Text className={classes.text}>{result.text}</Text>
    <Text size="sm" c="dimmed">Текст можно скопировать и разместить самостоятельно</Text>
  </Stack>;
}

export function ListingResult({ result }: { result: GenerationResult | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const channels = result?.channels ?? [];
  const active = channels.find(({ channel }) => channel.id === selected) ?? channels[0];

  return <Paper component="section" aria-labelledby="listing-result-heading" className={classes.result}>
    <Stack gap="md">
      <Title id="listing-result-heading" order={2}>Результат</Title>
      {active ? <Tabs variant="pills" value={active.channel.id} onChange={setSelected} keepMounted={false} activateTabWithKeyboard={false}
        classNames={{ list: classes.tabs, tab: classes.tab }}>
        <Tabs.List aria-label="Площадки результата">
          {channels.map(({ channel }) => <Tabs.Tab key={channel.id} value={channel.id}>{channel.name}</Tabs.Tab>)}
        </Tabs.List>
        {channels.map((item) => <Tabs.Panel key={item.channel.id} value={item.channel.id} pt="md">
          <ChannelTexts result={item} />
        </Tabs.Panel>)}
      </Tabs> : <Stack gap="sm">
        <Text fw={600}>Текстов пока нет</Text>
        <Text c="dimmed">После генерации здесь появятся заголовки и тексты для выбранных площадок.</Text>
      </Stack>}
    </Stack>
  </Paper>;
}
