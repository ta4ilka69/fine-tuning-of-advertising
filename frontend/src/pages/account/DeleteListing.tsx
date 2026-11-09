import { Modal, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/navigation';
import { PhotoManager, type PhotoState } from '../../features/listing-photos/model';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';

export function DeleteListing({ manager, state, suspended }: { manager: PhotoManager; state: PhotoState; suspended: boolean }) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  const deletion = state.listingDeletion;
  const phase = deletion?.phase;
  const pending = phase === 'deleting' || phase === 'checking';
  useEffect(() => { if (opened && !suspended) cancelButton.current?.focus(); }, [opened, phase, suspended]);
  const close = () => { setOpened(false); manager.cancelListingDelete(); };
  return <>
    <AppButton intent="quiet" disabled={suspended || (!deletion && (state.reading || !state.verified || !!state.deleting || state.uploads.some((entry) => !!entry.file)))}
      onClick={() => { if (manager.beginListingDelete()) setOpened(true); }}>Удалить объявление</AppButton>
    {!opened && deletion && <Text role="status" size="sm">{pending ? 'Запрос выполняется.' : deletion.error || 'Результат удаления ещё не подтверждён.'} Откройте «Удалить объявление», чтобы проверить состояние.</Text>}
    <Modal opened={opened && !suspended && !!deletion && phase !== 'deleted'} onClose={close} title="Удалить объявление?" centered size={480} attributes={{ header: { role: 'presentation' } }} styles={{ title: { fontSize: '1.5rem', fontWeight: 600, lineHeight: '1.33333' } }}
      closeButtonProps={{ 'aria-label': 'Закрыть подтверждение' }} aria-describedby="listing-delete-description">
      {deletion && <Stack>
        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{deletion.listing.address?.trim() || `Черновик от ${new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(deletion.listing.createdAt))}`}</Text>
        <Text size="sm" c="dimmed" id="listing-delete-description">Данные объявления, связанные фотографии и результаты будут удалены. Восстановить их не получится.</Text>
        {deletion.error && <AppNotice tone={phase === 'confirm' ? 'info' : phase === 'busy' || phase === 'conflict' ? 'warning' : 'error'} title={phase === 'confirm' ? 'Проверьте актуальные данные' : phase === 'busy' ? 'Удаление временно недоступно' : phase === 'conflict' ? 'Объявление изменилось' : 'Не удалось удалить'}>{deletion.error}</AppNotice>}
        {pending && <LoadingState label={phase === 'deleting' ? 'Удаляем объявление' : 'Проверяем состояние объявления'} />}
        <AppButton ref={cancelButton} intent="secondary" data-autofocus onClick={close}>{pending ? 'Закрыть окно' : 'Отмена'}</AppButton>
        {(phase === 'confirm' || phase === 'error' || phase === 'deleting') && <AppButton intent="danger" loading={phase === 'deleting'} onClick={() => { void manager.confirmListingDelete(); }}>Удалить</AppButton>}
        {['uncertain', 'conflict', 'busy', 'denied', 'checking'].includes(phase!) && <AppButton intent="secondary" loading={phase === 'checking'} onClick={() => { void manager.checkListingDelete(); }}>{phase === 'conflict' ? 'Загрузить актуальную карточку' : 'Проверить состояние'}</AppButton>}
        {phase === 'missing' && <AppButton onClick={() => navigate('/app')}>К списку объявлений</AppButton>}
      </Stack>}
    </Modal>
  </>;
}
