import { Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefCallback } from 'react';
import type { Photo } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { IconButton } from '../../shared/ui/IconButton';
import { LoadingState } from '../../shared/ui/LoadingState';
import { useRetrySeconds } from '../../shared/ui/use-retry-seconds';
import { PhotoManager, correctionActionAvailable, generationLocked, listingLocked, type PhotoState, type Upload } from './model';
import { PhotoAssessment } from './PhotoAssessment';
import { PhotoCorrectionPanel } from './PhotoCorrectionPanel';
import assessment from './PhotoAssessment.module.css';
import classes from './PhotoGallery.module.css';

function Preview({ file, url, name }: { file?: File; url?: string | null; name: string }) {
  const image = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!file || failed || !image.current) return;
    const objectUrl = URL.createObjectURL(file);
    image.current.src = objectUrl;
    return () => URL.revokeObjectURL(objectUrl);
  }, [file, failed]);
  return <div className={classes.preview}>{failed ? <span role="img" aria-label={`Не удалось показать превью ${name}`}>Нет превью</span>
    : file || url ? <img ref={image} src={url ?? undefined} alt={name} onError={() => setFailed(true)} /> : <span aria-hidden="true">Фото</span>}</div>;
}

function UploadedPhoto({ photo, disabled, deleting, onRemove, buttonRef, onCorrect, correctButtonRef, correctDisabled, correctionUnavailable }: {
  photo: Photo; disabled: boolean; deleting: boolean; onRemove: () => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onCorrect?: (button: HTMLButtonElement) => void;
  correctButtonRef: RefCallback<HTMLElement>; correctDisabled: boolean; correctionUnavailable: boolean;
}) {
  return <li className={`${classes.photo} ${assessment.highlight}`} data-quality={photo.quality ?? undefined} data-improvement={photo.improvementType ?? undefined}>
    <Preview key={`${photo.id}:${photo.thumbnailUrl}`} url={photo.status === 'ready' ? photo.thumbnailUrl : null} name={photo.fileName} />
    <div className={classes.description}><Text fw={600} className={classes.name}>{photo.fileName}</Text>
      {(deleting || !photo.quality) && <Text size="sm" c={photo.status === 'failed' ? 'red.8' : 'dimmed'}>{deleting ? 'Удаляем…' : photo.status === 'processing' ? 'Обрабатывается на сервере…'
        : photo.status === 'failed' ? 'Обработка не удалась. Удалите фото и загрузите заново.' : 'Готово'}</Text>}
      <PhotoAssessment photo={photo} />
      {onCorrect && <div><AppButton ref={correctButtonRef} className={classes.correct} size="xs" intent="secondary" disabled={correctDisabled}
        aria-label={`Исправить с ИИ: ${photo.fileName}`} onClick={(event) => onCorrect(event.currentTarget)}>Исправить с ИИ</AppButton></div>}
      {correctionUnavailable && photo.improvementType && <Text size="sm" c="dimmed">Исправление пока недоступно</Text>}
    </div>
    <IconButton ref={buttonRef} label={`Удалить фотографию ${photo.fileName}`} disabled={disabled} loading={deleting} onClick={onRemove}>×</IconButton>
  </li>;
}

function QueuedPhoto({ entry, locked, onDismiss }: { entry: Upload; locked: boolean; onDismiss: () => void }) {
  return <li className={classes.photo}>
    <Preview file={entry.file} name={entry.name} />
    <div className={classes.description}><Text fw={600} className={classes.name}>{entry.name}</Text>
      <Text size="sm" c={entry.error ? 'red.8' : 'dimmed'}>{entry.error ?? (entry.state === 'uploading' ? 'Загружаем файл…' : 'В очереди')}</Text>
    </div>
    <IconButton label={`Убрать из очереди ${entry.name}`} disabled={entry.state === 'uploading' || locked} onClick={onDismiss}>×</IconButton>
  </li>;
}

export function PhotoGallery({ manager, state }: { manager: PhotoManager; state: PhotoState }) {
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const correctionHeading = useRef<HTMLHeadingElement>(null);
  const correctionActionSource = useRef<HTMLButtonElement>(undefined);
  const removedCorrectionFocus = useRef(false);
  const trackCorrectionFocus = useCallback<RefCallback<HTMLElement>>((control) => {
    if (!control) return;
    return () => { if (control === control.ownerDocument.activeElement) removedCorrectionFocus.current = true; };
  }, []);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const focusTarget = useRef<{ id: string; index: number } | undefined>(undefined);
  const listing = state.listing!;
  const uploading = state.uploads.some((entry) => entry.state === 'uploading' || entry.state === 'waiting');
  const locked = listingLocked(state);
  const disabled = !!state.listingDeletion || !!state.editing || locked || !state.verified || state.reading || state.paused || !!state.deleting || uploading;
  const count = manager.count();
  const correction = listing.photoCorrection;
  const correctionUnavailable = correction === undefined;
  const correctionPhoto = listing.photos.find((photo) => photo.id === correction?.photoId);
  const feedback = state.correction;
  const seconds = useRetrySeconds(feedback?.retryAt);
  const pollSeconds = useRetrySeconds(feedback?.pollRetryAt);
  const canCorrect = (action: Parameters<PhotoManager['changeCorrection']>[0]) => correctionActionAvailable(state, action) && seconds === 0;
  const changeCorrection = (action: Parameters<PhotoManager['changeCorrection']>[0], button: HTMLButtonElement, photoId: string, correctionId?: string) => {
    correctionActionSource.current = button;
    void manager.changeCorrection(action, photoId, correctionId);
    if (manager.snapshot().correction?.phase !== 'sending') correctionActionSource.current = undefined;
  };
  useLayoutEffect(() => {
    if (feedback?.phase) return;
    const source = correctionActionSource.current;
    const removed = removedCorrectionFocus.current;
    correctionActionSource.current = undefined;
    removedCorrectionFocus.current = false;
    const target = correctionHeading.current ?? heading.current;
    if (!target || (!source && !removed)) return;
    const { activeElement, body } = target.ownerDocument;
    if (activeElement !== body && activeElement !== source) return;
    if (feedback?.message && source?.isConnected && !source.disabled) source.focus();
    else target.focus();
  }, [correction, feedback]);
  useEffect(() => {
    if (!state.removed || focusTarget.current?.id !== state.removed || state.reading || state.deleting) return;
    const button = [...buttons.current.values()][Math.min(focusTarget.current.index, buttons.current.size - 1)];
    if (button && !button.disabled) button.focus(); else heading.current?.focus();
    focusTarget.current = undefined;
  }, [state.removed, state.reading, state.deleting]);
  return <section className={classes.gallery} aria-labelledby="photos-heading">
    <Stack gap="lg">
      <Title order={2} id="photos-heading" ref={heading} tabIndex={-1}>Фото · {count} из 20</Title>
      <Text c="dimmed" id="photos-requirements">JPEG, PNG · до 15 МБ каждый · максимум 20 фото</Text>
      {feedback?.phase === 'sending' && <LoadingState label="Отправляем запрос на исправление" />}
      {feedback?.phase === 'checking' && !feedback.pollError && <LoadingState label="Проверяем состояние исправления" />}
      {feedback?.message && <AppNotice tone={seconds ? 'warning' : 'error'} title={feedback.message} />}
      {feedback?.pollError && <AppNotice tone="error" title={feedback.pollError}>
        <AppButton intent="secondary" disabled={state.reading || pollSeconds > 0} onClick={manager.refresh}>
          {pollSeconds ? `Проверить через ${pollSeconds} с` : 'Проверить исправление'}
        </AppButton>
      </AppNotice>}
      {correction && correctionPhoto && <PhotoCorrectionPanel correction={correction} photo={correctionPhoto} heading={correctionHeading}
        trackFocus={trackCorrectionFocus} disabled={!canCorrect('discard')} retryDisabled={!canCorrect('retry')}
        refreshing={state.reading || pollSeconds > 0} onRefresh={manager.refresh}
        onRetry={(button) => changeCorrection('retry', button, correction.photoId, correction.id)}
        onApply={(button) => changeCorrection('apply', button, correction.photoId, correction.id)}
        onDiscard={(button) => changeCorrection('discard', button, correction.photoId, correction.id)} />}
      {state.editing && <Text c="dimmed">Загрузка и удаление фотографий недоступны, пока открыта форма редактирования.</Text>}
      {state.editing && listing.status === 'generating' && <AppNotice tone="info" title="Идёт генерация">Добавлять и удалять фотографии можно после её завершения.</AppNotice>}
      {state.error && <AppNotice tone="error" title="Очередь остановлена"><p>{state.error}</p>
        <div className={classes.actions}><AppButton intent="secondary" disabled={!!state.listingDeletion || state.reading} onClick={manager.refresh}>Обновить фотографии</AppButton>
          {state.verified && !locked && <AppButton disabled={!!state.listingDeletion || !!state.editing || state.reading} onClick={manager.resume}>Продолжить очередь</AppButton>}</div>
      </AppNotice>}
      <div className={classes.select}>
        <Text fw={600}>{count >= 20 ? 'Добавлено максимум фотографий' : 'Добавьте фотографии объекта'}</Text>
        <Text size="sm" c="dimmed">{count >= 20 ? 'Чтобы добавить другую фотографию, удалите одну из загруженных.' : 'Можно выбрать несколько файлов. Они загрузятся по очереди.'}</Text>
        <input ref={input} className={classes.input} type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple tabIndex={-1} aria-label="Фотографии объявления"
          disabled={!!state.listingDeletion || !!state.editing || locked || !state.verified || count >= 20} onChange={(event) => {
            manager.add(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = '';
          }} />
        <AppButton intent="secondary" disabled={!!state.listingDeletion || !!state.editing || locked || !state.verified || count >= 20} aria-describedby="photos-requirements" onClick={() => input.current?.click()}>Выбрать фотографии</AppButton>
      </div>
      {state.reading && <LoadingState label="Обновляем фотографии" />}
      {!listing.photos.length && !state.uploads.length && <Text c="dimmed">Фотографий пока нет</Text>}
      <ul className={classes.photos} aria-label="Загруженные фотографии">
        {listing.photos.map((photo, index) => <UploadedPhoto key={photo.id} photo={photo} disabled={disabled} deleting={state.deleting === photo.id}
          correctionUnavailable={correctionUnavailable} correctButtonRef={trackCorrectionFocus} correctDisabled={!canCorrect('start')}
          onCorrect={correction === null && photo.improvementType === 'clutter' ? (button) => changeCorrection('start', button, photo.id) : undefined}
          buttonRef={(element) => { if (element) buttons.current.set(photo.id, element); else buttons.current.delete(photo.id); }}
          onRemove={() => { focusTarget.current = { id: photo.id, index }; manager.remove(photo.id); }} />)}
      </ul>
      {state.uploads.length > 0 && <div><Title order={3} size="h4" mb="sm">Очередь загрузки</Title><ul className={classes.photos} aria-label="Очередь загрузки">
        {state.uploads.map((entry) => <QueuedPhoto key={entry.key} entry={entry} locked={generationLocked(state)} onDismiss={() => manager.dismiss(entry.key)} />)}
      </ul></div>}
      <Text size="sm" c="dimmed">Файлы после загрузки обрабатываются на сервере. Фотографии сохраняют порядок загрузки.</Text>
      <div role="status" aria-live="polite" aria-atomic="true" className={classes.live}>{state.announcement}</div>
    </Stack>
  </section>;
}
