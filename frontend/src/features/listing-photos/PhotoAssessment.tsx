import { Text } from '@mantine/core';
import type { Photo, PhotoQuality } from '../../shared/api/types';
import classes from './PhotoAssessment.module.css';

const labels: Record<PhotoQuality, string> = {
  good: 'Хорошее фото',
  needs_fix: 'Можно улучшить',
  unfit: 'Не подходит',
};

export function PhotoAssessment({ photo }: { photo: Photo }) {
  if (!photo.quality) return null;
  return <div className={classes.assessment}>
    <Text size="sm" fw={600} className={classes.label}>{labels[photo.quality]}</Text>
    {photo.qualityReason && <Text size="sm">{photo.qualityReason}</Text>}
  </div>;
}
