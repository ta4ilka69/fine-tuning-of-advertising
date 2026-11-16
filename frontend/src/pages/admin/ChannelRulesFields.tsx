import { Group, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import { useEffect, useEffectEvent, useRef } from 'react';
import { AppButton } from '../../shared/ui/AppButton';
import type { ChannelRulesValues } from './channel-rules';
import classes from './Channels.module.css';

export function ChannelRulesFields({ form, reorder = false }: {
  form: UseFormReturnType<ChannelRulesValues>;
  reorder?: boolean;
}) {
  const { checklist } = form.values;
  const nextRuleId = useRef(0);
  const ruleFocus = useRef<number | undefined>(undefined);
  const getInputNode = useEffectEvent(form.getInputNode);

  useEffect(() => {
    if (ruleFocus.current === undefined) return;
    getInputNode(`checklist.${ruleFocus.current}.text`)?.focus();
    ruleFocus.current = undefined;
  }, [checklist]);

  const moveRule = (from: number, to: number) => {
    ruleFocus.current = to;
    form.reorderListItem('checklist', { from, to });
  };
  const RuleInput = reorder ? Textarea : TextInput;

  return <>
    <Textarea label="Системный промпт" placeholder="Опишите, как подготовить текст для площадки" minRows={6}
      autosize={reorder} maxRows={reorder ? 12 : undefined} required {...form.getInputProps('instruction')} />
    <Title order={2} size="h3">Чек-лист правил</Title>
    <Text size="sm" c="dimmed">{reorder ? 'Правила применяются по порядку. Оставьте хотя бы одно правило' : 'Добавьте хотя бы одно правило'}</Text>
    {checklist.map(({ id }, index) => (
      <Paper key={id} p="md">
        <Stack gap="sm" align="stretch">
          <RuleInput label={`Правило ${index + 1}`} placeholder="Например, используйте только подтверждённые факты"
            {...(reorder ? { autosize: true, minRows: 1, maxRows: 5, classNames: { input: classes.compactTextarea } } : {})}
            required {...form.getInputProps(`checklist.${index}.text`)} />
          {checklist.length > 1 && <Group gap="xs">
            {reorder && <>
              <AppButton intent="quiet" px="sm" disabled={index === 0} aria-label={`Поднять правило ${index + 1}`} onClick={() => moveRule(index, index - 1)}>Поднять</AppButton>
              <AppButton intent="quiet" px="sm" disabled={index === checklist.length - 1} aria-label={`Опустить правило ${index + 1}`} onClick={() => moveRule(index, index + 1)}>Опустить</AppButton>
            </>}
            <AppButton intent="quiet" px={reorder ? 'sm' : undefined} aria-label={`Удалить правило ${index + 1}`} onClick={() => {
              ruleFocus.current = Math.min(index, checklist.length - 2);
              form.removeListItem('checklist', index);
            }}>Удалить правило</AppButton>
          </Group>}
        </Stack>
      </Paper>
    ))}
    <div><AppButton intent="secondary" onClick={() => {
      ruleFocus.current = checklist.length;
      const nextId = checklist.reduce((next, { id }) => Math.max(next, id + 1), nextRuleId.current);
      nextRuleId.current = nextId + 1;
      form.insertListItem('checklist', { id: nextId, text: '' });
    }}>Добавить правило</AppButton></div>
  </>;
}
