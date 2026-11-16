import { Group, Paper, Stack, Tabs, Text, Title, VisuallyHidden } from '@mantine/core';
import { useCallback, useLayoutEffect, useRef, useState, type RefCallback, type RefObject } from 'react';
import type { ChannelResult, GenerationResult, Listing, Photo } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { IconButton } from '../../shared/ui/IconButton';
import classes from './ListingResult.module.css';

type CopyField = 'title' | 'text';
type CopyFeedback = { field: CopyField; value: string; focused: Element | null; status: 'pending' | 'copied' | 'error' };

function CopyNotice({ field, feedback, button, onRetry, trackFocus }: {
  field: CopyField;
  feedback?: CopyFeedback;
  button: RefObject<HTMLButtonElement | null>;
  onRetry: () => void;
  trackFocus: RefCallback<HTMLElement>;
}) {
  const notice = useRef<HTMLDivElement>(null);
  const visible = feedback?.status === 'copied' || feedback?.status === 'error';
  useLayoutEffect(() => {
    if (!visible || !notice.current || !button.current || feedback?.focused !== notice.current.ownerDocument.activeElement) return;
    const viewport = notice.current.ownerDocument.documentElement.clientHeight;
    const trigger = button.current.getBoundingClientRect();
    const message = notice.current.getBoundingClientRect();
    if (trigger.bottom > 0 && trigger.top < viewport && (message.top < 0 || message.bottom > viewport)) {
      notice.current.scrollIntoView({ block: 'nearest' });
    }
  }, [button, feedback, visible]);

  return <div ref={notice} className={classes.feedback} data-visible={visible || undefined}>
    <div role="status" aria-atomic="true" className={classes.copied}>
      {feedback?.status === 'copied' && (field === 'title' ? 'Заголовок скопирован' : 'Текст скопирован')}
    </div>
    {feedback?.status === 'error' && <AppNotice tone="error"
      title={field === 'title' ? 'Не удалось скопировать заголовок' : 'Не удалось скопировать текст'}>
      <Stack gap="sm" align="flex-start">
        <Text size="sm">Выделите нужный текст и скопируйте вручную: Ctrl+C или ⌘C.</Text>
        <AppButton ref={trackFocus} intent="secondary" onClick={onRetry}>Повторить копирование</AppButton>
      </Stack>
    </AppNotice>}
  </div>;
}

function ChannelTexts({ result, trackFocus }: { result: ChannelResult; trackFocus: RefCallback<HTMLElement> }) {
  const [feedback, setFeedback] = useState<CopyFeedback>();
  const titleButton = useRef<HTMLButtonElement>(null);
  const textButton = useRef<HTMLButtonElement>(null);
  const current = feedback && feedback.value === result[feedback.field] ? feedback : undefined;

  const copy = async (field: CopyField) => {
    const request: CopyFeedback = { field, value: result[field], focused: document.activeElement, status: 'pending' };
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

  const notice = (field: CopyField, button: RefObject<HTMLButtonElement | null>) => <CopyNotice
    field={field} feedback={current?.field === field ? current : undefined} button={button} trackFocus={trackFocus}
    onRetry={() => { button.current?.focus(); void copy(field); }} />;

  return <Stack gap="md">
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" fw={600}>Заголовок</Text>
      <IconButton ref={titleButton} intent="secondary" label="Копировать заголовок" onClick={() => { void copy('title'); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M6 16a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
        </svg>
      </IconButton>
    </Group>
    {notice('title', titleButton)}
    <Title order={3} className={classes.title}>{result.title}</Title>
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" fw={600}>Текст объявления</Text>
      <AppButton ref={textButton} intent="secondary" onClick={() => { void copy('text'); }}>Копировать текст</AppButton>
    </Group>
    {notice('text', textButton)}
    <Text className={classes.text}>{result.text}</Text>
    <Text size="sm" c="dimmed">Текст можно скопировать и разместить самостоятельно</Text>
  </Stack>;
}

function ListingAssessment({ score, why }: Pick<GenerationResult, 'score' | 'why'>) {
  return <Paper withBorder className={classes.assessment}>
    <Stack gap="sm">
      <Title order={3}>Оценка объявления</Title>
      {score !== undefined && <Text className={classes.score}>
        <strong>{score}</strong><span>из 100</span>
      </Text>}
      {!!why?.length && <>
        <Text fw={600}>Причины оценки</Text>
        <ul className={classes.reasons} role="list" aria-label="Причины оценки">
          {why.map(({ text, plus }, index) => <li key={index}>
            <span className={classes.reasonSign} data-plus={plus} aria-hidden="true">{plus ? '+' : '−'}</span>
            <span><VisuallyHidden>{plus ? 'Сильная сторона. ' : 'Слабая сторона. '}</VisuallyHidden>{text}</span>
          </li>)}
        </ul>
      </>}
    </Stack>
  </Paper>;
}

function RecommendedPhotos({ result, photos }: { result: ChannelResult; photos: Photo[] }) {
  const recommended = result.photoIds.flatMap((id) => {
    const photo = photos.find((photo) => photo.id === id && photo.status === 'ready');
    return photo ? [photo] : [];
  });
  if (!recommended.length) return null;

  return <Stack gap="sm">
    <Title order={3}>Какие фотографии поставить первыми</Title>
    <ol className={classes.recommendations} role="list" aria-label="Рекомендованные фотографии">
      {recommended.map((photo) => {
        const why = result.photos?.top.find(({ photo_id }) => photo_id === photo.id)?.why;
        return <li key={photo.id}>
          <img className={classes.thumbnail} src={photo.thumbnailUrl ?? undefined} alt={photo.fileName} loading="lazy" />
          {why && <Text mt="xs" size="sm">{why}</Text>}
        </li>;
      })}
    </ol>
  </Stack>;
}

export function ListingResult({ listing }: { listing: Pick<Listing, 'result' | 'status' | 'photos'> }) {
  const { result, status, photos } = listing;
  const [selected, setSelected] = useState<string | null>(null);
  const section = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const removedFocus = useRef(false);
  const trackFocus = useCallback<RefCallback<HTMLElement>>((element) => {
    if (!element) return;
    return () => {
      if (element.contains(element.ownerDocument.activeElement)) removedFocus.current = true;
    };
  }, []);
  useLayoutEffect(() => {
    if (!removedFocus.current || !section.current) return;
    removedFocus.current = false;
    const { activeElement, body } = section.current.ownerDocument;
    if (activeElement && activeElement !== body) return;
    const tab = section.current.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
    (tab ?? heading.current)?.focus();
  });
  const channels = result?.channels ?? [];
  const hasAssessment = !!result && (result.score !== undefined || !!result.why?.length);
  const activeId = (channels.find(({ channel }) => channel.id === selected) ?? channels[0])?.channel.id ?? null;
  if (selected !== activeId) setSelected(activeId);

  return <Paper component="section" ref={section} aria-labelledby="listing-result-heading" className={classes.result} data-assessed={hasAssessment || undefined}>
    <Stack gap="md">
      <Title ref={heading} id="listing-result-heading" order={2} tabIndex={-1}>Результат</Title>
      {status === 'draft' && result && <AppNotice tone="warning" title="Результат устарел">
        Данные или фотографии изменились. Ниже сохранён результат предыдущей версии объявления.
      </AppNotice>}
      {activeId ? <Tabs variant="pills" value={activeId} onChange={setSelected} keepMounted={false} activateTabWithKeyboard={false}
        classNames={{ list: classes.tabs, tab: classes.tab }}>
        <Tabs.List aria-label="Площадки результата">
          {channels.map(({ channel }) => <Tabs.Tab ref={trackFocus} key={channel.id} value={channel.id}>{channel.name}</Tabs.Tab>)}
        </Tabs.List>
        {channels.map((item) => <Tabs.Panel ref={trackFocus} key={item.channel.id} value={item.channel.id} pt="md">
          <Stack gap="lg">
            <div className={classes.overview}>
              <ChannelTexts result={item} trackFocus={trackFocus} />
              {hasAssessment && <ListingAssessment score={result.score} why={result.why} />}
            </div>
            <RecommendedPhotos result={item} photos={photos} />
          </Stack>
        </Tabs.Panel>)}
      </Tabs> : <Stack gap="sm">
        <Text fw={600}>Текстов пока нет</Text>
        <Text c="dimmed">После генерации здесь появятся заголовки и тексты для выбранных площадок.</Text>
      </Stack>}
    </Stack>
  </Paper>;
}
