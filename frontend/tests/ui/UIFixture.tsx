import { Checkbox, Group, Paper, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { AppProvider } from '../../src/app/AppProvider';
import { AppButton, type ActionIntent } from '../../src/shared/ui/AppButton';
import { AppNotice } from '../../src/shared/ui/AppNotice';
import { IconButton } from '../../src/shared/ui/IconButton';
import { LoadingState } from '../../src/shared/ui/LoadingState';
import { PageLayout } from '../../src/shared/ui/PageLayout';
import type { AppHeaderProps } from '../../src/shared/ui/AppHeader';

const intents: [ActionIntent, string][] = [['primary', 'Основная'], ['secondary', 'Второстепенная'], ['quiet', 'Без фона'], ['danger', 'Опасная']];

export function UIFixture() {
  const [actions, setActions] = useState(0);
  const [notice, setNotice] = useState(true);
  const act = () => setActions((value) => value + 1);
  const member = { userName: 'Захар Брюханов с длинным именем', listingsHref: '#listings', onLogout: act };
  const variant = new URLSearchParams(location.search).get('header');
  const header: AppHeaderProps = variant === 'admin'
    ? { ...member, variant: 'admin', channelsHref: '#channels', currentSection: 'channels' }
    : variant === 'user' ? { ...member, variant: 'user' } : { variant: 'guest', onStart: act };
  return (
    <AppProvider>
      <PageLayout header={header}>
        <Stack gap="lg">
          <Title order={1}>Общие элементы</Title>
          <Text id="actions">Выполнено действий: {actions}</Text>
          <Paper component="section" p="md" aria-labelledby="buttons-title">
            <Stack gap="md">
              <Title id="buttons-title" order={2}>Кнопки</Title>
              {intents.map(([intent, label]) => (
                <Group key={intent} gap="sm">
                  <AppButton intent={intent} onClick={act}>{label}</AppButton>
                  <AppButton intent={intent} disabled onClick={act}>{label}: недоступна</AppButton>
                  <AppButton intent={intent} loading onClick={act}>{label}: загрузка</AppButton>
                </Group>
              ))}
              <Group gap="sm">
                <IconButton label="Добавить фото" onClick={act}><span aria-hidden="true">＋</span></IconButton>
                <IconButton label="Удалить фото" intent="danger" onClick={act}><span aria-hidden="true">×</span></IconButton>
                <IconButton label="Недоступное действие" disabled onClick={act}><span aria-hidden="true">×</span></IconButton>
                <IconButton label="Загрузка фото" loading onClick={act}><span aria-hidden="true">＋</span></IconButton>
              </Group>
            </Stack>
          </Paper>
          <Paper component="section" p="md" aria-labelledby="fields-title">
            <Stack gap="md">
              <Title id="fields-title" order={2}>Поля и выбор</Title>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                <TextInput label="Адрес" placeholder="Улица, дом" description="Укажите адрес объекта" />
                <TextInput label="Цена" defaultValue="9 800 000" />
                <TextInput label="Площадь" defaultValue="0" error="Укажите площадь больше нуля" />
                <TextInput label="Сохранённый адрес" value="Лесной проспект, 10" disabled />
                <TextInput label="Поиск адреса" value="Лесной" loading readOnly aria-busy="true" description="Ищем подходящий адрес" />
                <TextInput label="Поле с ошибкой" error="Не удалось проверить значение" disabled />
                <Textarea label="Комментарий" description="Что важно рассказать об объекте" placeholder="Светлая квартира" />
                <Textarea label="Описание с ошибкой" error="Добавьте описание" />
                <Textarea label="Сохранённое описание" value="Светлая квартира" disabled />
                <Select label="Тип сделки" placeholder="Выберите тип" data={['Продажа', 'Длительная аренда', 'Посуточная аренда']} />
                <Select label="Тип объекта" data={['Квартира', 'Дом']} error="Выберите тип объекта" />
                <Select label="Сохранённый тип" data={['Квартира']} value="Квартира" disabled />
              </SimpleGrid>
              <Group gap="lg">
                <Checkbox label="Авито" />
                <Checkbox label="ЦИАН" defaultChecked />
                <Checkbox label="Telegram недоступен" disabled />
                <Checkbox label="Ошибка выбора" error="Выберите площадку" />
                <Switch label="Сохранять черновик" />
                <Switch label="Уведомления включены" defaultChecked />
                <Switch label="Недоступный параметр" disabled />
              </Group>
            </Stack>
          </Paper>
          <Stack component="section" gap="sm" aria-labelledby="notices-title">
            <Title order={2} id="notices-title">Уведомления</Title>
            {notice && <AppNotice tone="success" title="Изменения сохранены" onClose={() => setNotice(false)}>Можно продолжать работу с объявлением</AppNotice>}
            <AppNotice tone="error" title="Не удалось сохранить">Проверьте подключение и попробуйте ещё раз</AppNotice>
            <AppNotice tone="warning" title="Проверьте площадь кухни">Площадь кухни больше общей площади</AppNotice>
            <AppNotice tone="info" title="Добавьте фотографии">Загрузите хотя бы одну фотографию</AppNotice>
            <AppNotice tone="loading" title="Сохраняем изменения">Подождите завершения операции</AppNotice>
            <LoadingState label="Готовим фотографии" />
          </Stack>
        </Stack>
      </PageLayout>
    </AppProvider>
  );
}
