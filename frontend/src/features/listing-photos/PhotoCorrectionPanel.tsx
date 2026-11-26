import { Group, Stack, Text, Title } from '@mantine/core';
import { useState, type Ref } from 'react';
import type { Photo, PhotoCorrection } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import classes from './PhotoGallery.module.css';

function PhotoComparison({ original, preview, disabled, onApply, onDiscard }: {
  original: string; preview: string; disabled: boolean; onApply: () => void; onDiscard: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = () => { setFailed(false); setLoaded(0); setAttempt((value) => value + 1); };
  return <>
    <div className={classes.comparison} key={attempt}>
      {[[original, 'Исходное фото'], [preview, 'Исправленный вариант']].map(([url, label]) => <figure key={url}>
        <figcaption>{label}</figcaption>
        <img src={url} alt={label} onLoad={() => setLoaded((value) => value + 1)} onError={() => setFailed(true)} />
      </figure>)}
    </div>
    {failed && <AppNotice tone="error" title="Не удалось загрузить фото">
      <AppButton intent="secondary" onClick={retry}>Загрузить фото снова</AppButton>
    </AppNotice>}
    <Text size="sm">После применения объявление будет использовать исправленный вариант. Исходник сохранится.</Text>
    <Group>
      <AppButton disabled={disabled || failed || loaded < 2} onClick={onApply}>Применить исправление</AppButton>
      <AppButton intent="secondary" disabled={disabled} onClick={onDiscard}>Оставить исходное фото</AppButton>
    </Group>
  </>;
}

export function PhotoCorrectionPanel({ correction, photo, disabled, heading, onApply, onDiscard, onRetry }: {
  correction: PhotoCorrection; photo: Photo; disabled: boolean; heading: Ref<HTMLHeadingElement>;
  onApply: () => void; onDiscard: () => void; onRetry: () => void;
}) {
  return <section className={classes.correction} aria-labelledby="photo-correction-heading">
    <Stack gap="sm">
      <Title order={3} ref={heading} tabIndex={-1} id="photo-correction-heading">Исправление фото</Title>
      <Text size="sm" fw={600}>{photo.fileName}</Text>
      {correction.status === 'processing' && <>
        <LoadingState label="Исправляем фотографию" />
        <Text size="sm">Можно уйти со страницы и вернуться к результату позже.</Text>
        <div><AppButton intent="secondary" disabled={disabled} onClick={onDiscard}>Отменить исправление</AppButton></div>
      </>}
      {correction.status === 'ready' && <PhotoComparison key={correction.id} original={photo.contentUrl!}
        preview={correction.previewUrl} disabled={disabled} onApply={onApply} onDiscard={onDiscard} />}
      {correction.status === 'failed' && <>
        <AppNotice tone="error" title="Не удалось исправить фото">
          {correction.error.code === 'PHOTO_CORRECTION_TIMEOUT' ? 'Обработка заняла слишком много времени. Попробуйте снова.' : 'Исходное фото сохранено. Попробуйте снова.'}
        </AppNotice>
        <Group>
          <AppButton disabled={disabled} onClick={onRetry}>Повторить исправление</AppButton>
          <AppButton intent="secondary" disabled={disabled} onClick={onDiscard}>Оставить исходное фото</AppButton>
        </Group>
      </>}
    </Stack>
  </section>;
}
