import { Modal, Stack, Text, Textarea, Title } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { ListingForm } from '../../features/listing-form/ListingForm';
import { labels, fieldKey, fieldOptions } from '../../features/listing-form/fields';
import type { ListingFormValues } from '../../features/listing-form/model';
import type { PhotoManager, PhotoState } from '../../features/listing-photos/model';
import { RequestError } from '../../shared/api/errors';
import type { Listing } from '../../shared/api/types';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';

type Block = 'conflict' | 'busy' | 'access';

function localText(values: ListingFormValues) {
  return [...Object.entries(labels).flatMap(([path, label]) => {
    const value = values.fields[fieldKey(path)];
    const options = fieldOptions(path);
    const display = (entry: string) => options.find((option) => option.value === entry)?.label ?? (entry === 'true' ? 'Да' : entry === 'false' ? 'Нет' : entry);
    return value !== undefined && value.length ? [`${label}: ${Array.isArray(value) ? value.map(display).join(', ') : display(value)}`] : [];
  }), ...values.undergrounds.map((station) => `Метро: ${station.name}, ${station.minutes}, ${station.transportType === 'walk' ? 'пешком' : station.transportType === 'transport' ? 'на транспорте' : station.transportType}`)].join('\n');
}

export default function EditListing({ initial, manager, state, onCancel, recheck, suspended }: {
  initial: Listing; manager: PhotoManager; state: PhotoState; onCancel: () => void;
  recheck: (unauthorized: boolean) => void; suspended: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [snapshot, setSnapshot] = useState(initial);
  const [revision, setRevision] = useState(0);
  const locked = state.listing?.status === 'generating';
  const observed = state.inaccessible ? 'access' : locked ? 'busy' : state.listing && state.listing.version !== snapshot.version && state.listing.version !== state.editSavedVersion ? 'conflict' : undefined;
  const [block, setBlock] = useState<Block | undefined>(observed);
  const [confirm, setConfirm] = useState(false);
  const [copy, setCopy] = useState<string>();
  const [showCopy, setShowCopy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>();
  const [local, setLocal] = useState<ListingFormValues>();
  const dirty = useRef(false);
  const active = useRef<AbortController | null>(null);
  const [previous, setPrevious] = useState(observed);
  if (previous !== observed) { setPrevious(observed); if (observed) setBlock(observed); }
  const [wasSuspended, setWasSuspended] = useState(suspended);
  if (wasSuspended !== suspended) { setWasSuspended(suspended); if (suspended) setReading(false); }
  useEffect(() => {
    if (suspended) active.current?.abort();
    return () => { active.current?.abort(); };
  }, [suspended]);

  const reload = async (replace: boolean) => {
    if (reading || suspended) return;
    recheck(false);
    const controller = new AbortController();
    active.current = controller;
    setReading(true); setError(undefined); setConfirm(false);
    try {
      const current = await manager.reloadEdit(controller.signal);
      if (controller.signal.aborted) return;
      if (replace) {
        if (dirty.current && local) setCopy(localText(local));
        setSnapshot(current); setRevision((value) => value + 1); dirty.current = false;
        setBlock(current.status === 'generating' ? 'busy' : undefined);
      } else if (current.version !== snapshot.version) setBlock('conflict');
      else setBlock(current.status === 'generating' ? 'busy' : undefined);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError('Не удалось загрузить актуальное состояние. Ваши правки остались в форме. Повторите запрос.');
      if (failure instanceof RequestError && failure.status === 401) recheck(true);
    } finally { if (!controller.signal.aborted) setReading(false); }
  };
  const requestReplace = () => { if (dirty.current) setConfirm(true); else void reload(true); };
  const notice = <>
    {block && <AppNotice tone={block === 'conflict' ? 'warning' : 'info'} title={block === 'conflict' ? 'Объявление изменилось в другом окне' : block === 'busy' ? 'Идёт генерация' : 'Доступ к объявлению изменился'}>
      <Stack gap="sm">
        <Text>{block === 'conflict' ? 'Ваши правки остались в форме. Загрузите актуальные данные перед новым сохранением.' : block === 'busy' ? 'Изменение недоступно до завершения генерации. Ваши правки остались в форме.' : 'Ваши правки остались в форме. Проверьте доступ перед сохранением.'}</Text>
        <div>{block === 'busy' && <AppButton intent="secondary" disabled={reading || suspended} onClick={() => { void reload(false); }}>Проверить состояние</AppButton>}</div>
        <div><AppButton intent="secondary" loading={reading} disabled={suspended} onClick={requestReplace}>Загрузить актуальные данные</AppButton></div>
        {local && <div><AppButton intent="quiet" onClick={() => { setCopy(localText(local)); setShowCopy(true); }}>Посмотреть мои правки</AppButton></div>}
      </Stack>
    </AppNotice>}
    {error && <AppNotice tone="error" title="Не удалось обновить">{error}</AppNotice>}
    {copy !== undefined && <AppButton intent="quiet" onClick={() => setShowCopy(true)}>Открыть сохранённые правки</AppButton>}
  </>;
  return <>
    <Title order={2} ref={heading} tabIndex={-1}>Данные объекта</Title>
    <ListingForm key={revision} initialData={snapshot.data} mode="edit" suspended={suspended} disabled={!!block || !!locked || reading || suspended || state.inaccessible}
      notice={notice} onCancel={onCancel} onChange={(values, changed) => { setLocal(values); dirty.current = changed; }}
      onSave={async (data, signal) => { recheck(false); const saved = await manager.saveEdit(data, snapshot.version, signal); setSnapshot(saved); return saved; }}
      onSaved={() => { dirty.current = false; }} onUnauthorized={() => recheck(true)}
      onFailure={(failure) => {
        if (!(failure instanceof RequestError)) return;
        if (failure.status === 409) setBlock(failure.code === 'LISTING_BUSY' ? 'busy' : 'conflict');
        if (failure.status === 403 || failure.status === 404) setBlock('access');
      }} />
    <Modal opened={confirm && !suspended} onClose={() => setConfirm(false)} title="Загрузить актуальные данные?" centered>
      <Stack><Text>Загрузка заменит введённые значения. Ваши правки останутся в памяти этой страницы: их можно открыть и скопировать вручную.</Text>
        <AppButton onClick={() => { void reload(true); }}>Загрузить и заменить форму</AppButton>
        <AppButton intent="secondary" onClick={() => setConfirm(false)}>Вернуться к форме</AppButton>
      </Stack>
    </Modal>
    <Modal opened={showCopy && !suspended} onClose={() => setShowCopy(false)} title="Мои правки" centered>
      <Stack><Textarea label="Сохранённый ввод" value={copy ?? ''} readOnly autosize minRows={8} maxRows={20} />
        <Text size="sm" c="dimmed">Правки хранятся только в памяти этой страницы. Выделите и скопируйте нужный текст перед уходом.</Text>
        <AppButton onClick={() => setShowCopy(false)}>Вернуться к форме</AppButton>
      </Stack>
    </Modal>
  </>;
}
