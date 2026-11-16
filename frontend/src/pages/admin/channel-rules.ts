export type ChannelRulesValues = {
  instruction: string;
  checklist: { id: number; text: string }[];
};

export const channelRulesValidation = {
  instruction: (value: string) => value.trim() ? null : 'Введите системный промпт',
  checklist: { text: (value: string) => value.trim() ? null : 'Введите текст правила' },
};

export function channelRuleField(pointer: string, ruleCount: number) {
  if (pointer === '/instruction') return 'instruction';
  if (pointer === '/checklist') return 'checklist.0.text';
  const index = /^\/checklist\/(0|[1-9]\d*)$/.exec(pointer)?.[1];
  return index !== undefined && Number(index) < ruleCount ? `checklist.${index}.text` : undefined;
}
