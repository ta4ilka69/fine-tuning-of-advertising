import { Group, Stack, Text, Title } from '@mantine/core';
import { useCallback, useRef, useState, type Ref, type RefCallback } from 'react';
import type { Photo, PhotoCorrection } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import classes from './PhotoGallery.module.css';

type ComparisonControls = {
  disabled: boolean;
  refreshing: boolean;
  trackFocus: RefCallback<HTMLElement>;
  onApply: (button: HTMLButtonElement) => void;
  onDiscard: (button: HTMLButtonElement) => void;
  onRefresh: () => Promise<void> | undefined;
};

function PhotoComparison({ original, preview, disabled, refreshing, trackFocus, onApply, onDiscard, onRefresh }: ComparisonControls & {
  original: string; preview: string;
}) {
  const comparison = useRef<HTMLDivElement>(null);
  const trackComparison = useCallback<RefCallback<HTMLDivElement>>((element) => {
    comparison.current = element;
    return trackFocus(element);
  }, [trackFocus]);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = async (button: HTMLButtonElement) => {
    if (button === button.ownerDocument.activeElement) comparison.current?.focus();
    await onRefresh();
    if (!comparison.current?.isConnected) return;
    setFailed(false); setLoaded(0); setAttempt((value) => value + 1);
  };
  return <>
    <div className={classes.comparison} ref={trackComparison} tabIndex={-1}>
      {[[original, 'Исходное фото'], [preview, 'Исправленный вариант']].map(([url, label]) => <figure key={`${url}:${attempt}`}>
        <figcaption>{label}</figcaption>
        <img src={url} alt={label} onLoad={() => setLoaded((value) => value + 1)} onError={() => setFailed(true)} />
      </figure>)}
    </div>
    {failed && <AppNotice tone="error" title="Не удалось загрузить фото">
      <AppButton ref={trackFocus} intent="secondary" disabled={refreshing} onClick={(event) => { void retry(event.currentTarget); }}>Загрузить фото снова</AppButton>
    </AppNotice>}
    <Text size="sm">После применения объявление будет использовать исправленный вариант. Исходник сохранится.</Text>
    <Group>
      <AppButton ref={trackFocus} disabled={disabled || failed || loaded < 2} onClick={(event) => onApply(event.currentTarget)}>Применить исправление</AppButton>
      <AppButton ref={trackFocus} intent="secondary" disabled={disabled} onClick={(event) => onDiscard(event.currentTarget)}>Оставить исходное фото</AppButton>
    </Group>
  </>;
}

export function PhotoCorrectionPanel({ correction, photo, heading, retryDisabled, onRetry, ...controls }: ComparisonControls & {
  correction: PhotoCorrection; photo: Photo; heading: Ref<HTMLHeadingElement>;
  retryDisabled: boolean; onRetry: (button: HTMLButtonElement) => void;
}) {
  const { disabled, trackFocus, onDiscard } = controls;
  return <section className={classes.correction} aria-labelledby="photo-correction-heading">
    <Stack gap="sm">
      <Title order={3} ref={heading} tabIndex={-1} id="photo-correction-heading">Исправление фото</Title>
      <Text size="sm" fw={600}>{photo.fileName}</Text>
      {correction.status === 'processing' && <>
        <LoadingState label="Исправляем фотографию" />
        <Text size="sm">Можно уйти со страницы и вернуться к результату позже.</Text>
        <div><AppButton ref={trackFocus} intent="secondary" disabled={disabled} onClick={(event) => onDiscard(event.currentTarget)}>Отменить исправление</AppButton></div>
      </>}
      {correction.status === 'ready' && <PhotoComparison key={correction.id} original={photo.contentUrl!}
        preview={correction.previewUrl} {...controls} />}
      {correction.status === 'failed' && <>
        <AppNotice tone="error" title="Не удалось исправить фото">
          {correction.error.code === 'PHOTO_CORRECTION_TIMEOUT' ? 'Обработка заняла слишком много времени. Попробуйте снова.' : 'Исходное фото сохранено. Попробуйте снова.'}
        </AppNotice>
        <Group>
          <AppButton ref={trackFocus} disabled={retryDisabled} onClick={(event) => onRetry(event.currentTarget)}>Повторить исправление</AppButton>
          <AppButton ref={trackFocus} intent="secondary" disabled={disabled} onClick={(event) => onDiscard(event.currentTarget)}>Оставить исходное фото</AppButton>
        </Group>
      </>}
    </Stack>
  </section>;
}
