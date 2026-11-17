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
export function readLimit(value: string) {
  if (!value.trim()) return null;
  return /^\d+$/.test(value.trim()) ? Number(value) : NaN;
}

export function validateLimit(value: string) {
  const limit = readLimit(value);
  return limit === null || (Number.isSafeInteger(limit) && limit > 0) ? null : 'Введите целое число больше нуля';
}

export function channelSettingsField(pointer: string, ruleCount: number) {
  switch (pointer) {
    case '/name': return 'name';
    case '/description': return 'description';
    case '/isActive': return 'isActive';
    case '/limits':
    case '/limits/titleLimit': return 'titleLimit';
    case '/limits/textLimit': return 'textLimit';
    default: return channelRuleField(pointer, ruleCount);
  }
}
