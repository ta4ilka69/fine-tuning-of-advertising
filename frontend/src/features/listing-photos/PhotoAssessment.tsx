import { Text } from '@mantine/core';
import type { Photo, PhotoQuality } from '../../shared/api/types';
import classes from './PhotoAssessment.module.css';

const labels: Record<PhotoQuality, string> = {
  good: 'Хорошее фото',
  needs_fix: 'Можно улучшить',
  unfit: 'Не подходит',
};

export function PhotoAssessment({ photo }: { photo: Photo }) {
  const improvement = photo.improvementType === 'clutter' ? photo.improvementLabel || 'Убрать лишнее из кадра' : undefined;
  if (!photo.quality && !improvement && !photo.scene && !photo.description) return null;
  return <div className={classes.assessment}>
    {photo.quality && <Text size="sm" fw={600} className={classes.label}>{photo.qualityLabel ? `Оценка: ${photo.qualityLabel}` : labels[photo.quality]}</Text>}
    {photo.qualityReason && <Text size="sm">{photo.qualityReason}</Text>}
    {improvement && <Text size="sm" fw={600}>Правка ИИ: {improvement}</Text>}
    {(photo.scene || photo.description || (improvement && photo.editInstruction)) && <details className={classes.details}>
      <summary>Детали анализа</summary>
      {improvement && photo.editInstruction && <Text size="sm">{photo.editInstruction}</Text>}
      {photo.scene && <Text size="sm" fw={600}>{photo.scene}</Text>}
      {photo.description && <Text size="sm">{photo.description}</Text>}
    </details>}
  </div>;
}
