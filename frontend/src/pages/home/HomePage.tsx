import { Badge, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { AppButton } from '../../shared/ui/AppButton';
import { PageLayout } from '../../shared/ui/PageLayout';
import livingRoom from './assets/living-room.jpg';
import classes from './HomePage.module.css';

const channels = ['Авито', 'ЦИАН', 'Telegram'];
const features = [
  ['Данные и фото', 'Укажите характеристики, условия сделки и добавьте фотографии.'],
  ['Тексты для площадок', 'Выберите Авито, ЦИАН или Telegram. Можно несколько.'],
  ['Оценка и рекомендации', 'Посмотрите причины оценки и рекомендуемые фотографии.'],
];

export function HomePage({ onStart }: { onStart?: () => void }) {
  return (
    <PageLayout header={{ variant: 'guest', onStart }} className={classes.main}>
      <Text size="sm" fw={500} c="var(--app-brand)" tt="uppercase" mb="xl">
        От объекта к объявлению
      </Text>
      <div className={classes.hero}>
        <Stack gap="lg" className={classes.copy}>
          <Title order={1} className={classes.title}>Поможем рассказать о доме главное</Title>
          <Text size="lg" fw={600} c="dimmed">От первого фото до «хочу посмотреть»</Text>
          <Text c="dimmed">
            Добавьте данные и фотографии объекта. Получите тексты для площадок, оценку и рекомендации по первым фото.
          </Text>
          <div>
            <AppButton onClick={onStart} disabled={!onStart} aria-describedby={!onStart ? 'start-availability' : undefined} className={classes.start}>
              Начать работу
            </AppButton>
            {!onStart && <Text id="start-availability" size="xs" c="dimmed" mt="sm">Вход скоро появится</Text>}
          </div>
        </Stack>
        <img className={classes.photo} src={livingRoom} width={446} height={384} alt="Светлая гостиная с зелёным диваном и большим окном" />
      </div>
      <Paper component="section" p="lg" mt="xl" aria-labelledby="features-title">
        <Stack gap="md">
          <Title order={2} id="features-title">Подготовьте объявление в одном месте</Title>
          {features.map(([title, description]) => (
            <div key={title}>
              <Title order={3}>{title}</Title>
              <Text c="dimmed" mt="sm">{description}</Text>
            </div>
          ))}
          <Group gap="sm" aria-label="Площадки размещения">
            {channels.map((channel) => <Badge key={channel} c="var(--app-brand)">{channel}</Badge>)}
          </Group>
        </Stack>
      </Paper>
    </PageLayout>
  );
}
