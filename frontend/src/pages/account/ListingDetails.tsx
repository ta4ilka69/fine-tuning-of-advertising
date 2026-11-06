import { Stack } from '@mantine/core';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { LoadingState } from '../../shared/ui/LoadingState';
import { ListingCard } from './ListingList';
import classes from './Listings.module.css';
import { PhotoManager } from '../../features/listing-photos/model';
import { PhotoGallery } from '../../features/listing-photos/PhotoGallery';

export function ListingDetails({ id, recheck }: { id: string; recheck: (unauthorized: boolean) => void }) {
  const [manager] = useState(() => new PhotoManager(id, recheck));
  const state = useSyncExternalStore(manager.subscribe, manager.snapshot);
  const { listing: item, error } = state;
  useEffect(() => {
    manager.start();
    return () => manager.stop();
  }, [manager]);
  return <Stack gap="lg">
    {item && !state.inaccessible ? <><ul className={classes.items}><ListingCard item={item} linked={false} isApartments={item.isApartments} /></ul><PhotoGallery manager={manager} state={state} /></>
      : error ? <AppNotice tone="error" title="Не удалось загрузить объявление"><p>{error}</p><AppButton disabled={state.reading} onClick={() => { recheck(false); manager.refresh(); }}>Повторить</AppButton></AppNotice>
        : <LoadingState label="Загружаем объявление" />}
  </Stack>;
}
