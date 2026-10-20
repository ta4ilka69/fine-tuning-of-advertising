import { Badge, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import classes from './HomePage.module.css';

const channels = ['Авито', 'ЦИАН', 'Telegram'];

export function HomePage() {
  return (
    <Container size="lg" className={classes.page}>
      <header className={classes.header}>
        <Group gap="sm">
          <span className={classes.mark} aria-hidden="true">д.</span>
          <Text fw={600}>Докрутка объявления</Text>
        </Group>
        <Badge variant="outline" color="gray">Недвижимость</Badge>
      </header>
      <main className={classes.main}>
        <Stack gap="xl" maw={760}>
          <Text size="sm" fw={600} c="teal.8" tt="uppercase" lts={2}>
            От объекта к объявлению
          </Text>
          <Title order={1} className={classes.title}>
            Поможем рассказать о доме главное
          </Title>
          <Text size="xl" c="dimmed" maw={570}>
            От первого фото до «хочу посмотреть»
          </Text>
          <Group gap="sm" aria-label="Площадки размещения">
            {channels.map((channel) => (
              <Badge key={channel} size="lg" variant="light" color="teal" tt="none">
                {channel}
              </Badge>
            ))}
          </Group>
        </Stack>
        <Paper component="section" withBorder p="xl" radius="lg" className={classes.notice}>
          <Title order={2} size="h3">Рабочее пространство готовится</Title>
          <Text c="dimmed" mt="sm" maw={560}>
            Здесь появятся форма объекта, загрузка фотографий и результаты подготовки объявления.
          </Text>
        </Paper>
      </main>
    </Container>
  );
}
