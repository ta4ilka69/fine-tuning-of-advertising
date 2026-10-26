import { Group, Loader, Text } from '@mantine/core';

export function LoadingState({ label = 'Загружаем' }: { label?: string }) {
  return (
    <Group gap="sm" role="status" aria-live="polite">
      <Loader aria-hidden="true" />
      <Text size="sm" c="dimmed">{label}</Text>
    </Group>
  );
}
