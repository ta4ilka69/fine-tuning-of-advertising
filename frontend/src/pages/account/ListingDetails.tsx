import { Stack } from '@mantine/core';
import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { ListingCard } from './ListingList';
import classes from './Listings.module.css';
import { DeleteListing } from './DeleteListing';
import { confirmNavigation, navigate } from '../../app/navigation';
import type { Listing } from '../../shared/api/types';
import { PhotoManager } from '../../features/listing-photos/model';
import { PhotoGallery } from '../../features/listing-photos/PhotoGallery';

const EditListing = lazy(() => import('./EditListing'));

export function ListingDetails({ id, recheck, suspended = false }: { id: string; recheck: (unauthorized: boolean) => void; suspended?: boolean }) {
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [editing, setEditing] = useState<Listing>();
  const [manager] = useState(() => new PhotoManager(id, recheck));
  const state = useSyncExternalStore(manager.subscribe, manager.snapshot);
  const { listing: item, error } = state;
  useEffect(() => {
    if (!suspended) manager.start();
    return () => manager.stop();
  }, [manager, suspended]);
  useEffect(() => {
    if (editing) wasEditing.current = true;
    else if (wasEditing.current) { wasEditing.current = false; editButton.current?.focus(); }
  }, [editing]);
  useEffect(() => {
    if (!suspended && state.listingDeletion?.phase === 'deleted') navigate('/app');
  }, [state.listingDeletion?.phase, suspended]);
  return <Stack gap="lg">
    {editing && <Suspense fallback={<LoadingState label="Загружаем форму" />}><EditListing initial={editing} manager={manager} state={state} suspended={suspended} recheck={recheck}
      onCancel={() => { if (confirmNavigation()) { manager.endEdit(); setEditing(undefined); } }} /></Suspense>}
    {item && (!state.inaccessible || editing) ? <><ul className={classes.items}><ListingCard item={item} linked={false} isApartments={item.isApartments} /></ul>{!editing && <div><AppButton ref={editButton} disabled={!!state.listingDeletion || suspended || state.reading || !state.verified || item.status === 'generating' || state.uploads.some((entry) => !!entry.file) || !!state.deleting}
      onClick={() => { const snapshot = manager.beginEdit(); if (snapshot) setEditing(snapshot); }}>Редактировать объявление</AppButton><DeleteListing manager={manager} state={state} suspended={suspended} /></div>}
      {!editing && item.status === 'generating' && <AppNotice tone="info" title="Идёт генерация">Редактировать объявление можно после её завершения.<AppButton intent="secondary" disabled={state.reading} onClick={manager.refresh}>Проверить состояние</AppButton></AppNotice>}
      <PhotoGallery manager={manager} state={state} /></>
      : error ? <AppNotice tone="error" title="Не удалось загрузить объявление"><p>{error}</p><AppButton disabled={state.reading} onClick={() => { recheck(false); manager.refresh(); }}>Повторить</AppButton></AppNotice>
        : <LoadingState label="Загружаем объявление" />}
  </Stack>;
}
