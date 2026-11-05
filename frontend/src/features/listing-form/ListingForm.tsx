import { MultiSelect, NativeSelect, Paper, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ListingData } from '../../shared/api/listing-data';
import { listingRules } from '../../shared/api/listing-rules';
import { RequestError } from '../../shared/api/errors';
import { AppButton } from '../../shared/ui/AppButton';
import { AppNotice } from '../../shared/ui/AppNotice';
import { fieldOptions, labels, sections } from './fields';
import { inputPath, listingToForm, prepareListing, serverFieldErrors, visibleField, type ListingFormValues, type FormErrors } from './model';
import { useUnsavedChanges } from './use-unsaved-changes';
import classes from './ListingForm.module.css';

const controlId = (path: string) => `listing-${path.replaceAll('.', '-')}`;
const emptyOption = { value: '', label: 'Неизвестно' };
const flags = [emptyOption, { value: 'true', label: 'Да' }, { value: 'false', label: 'Нет' }];

type Props = {
  initialValues?: ListingFormValues;
  initialData?: ListingData;
  onChange?: (values: ListingFormValues) => void;
  onSave: (data: ListingData, signal: AbortSignal) => Promise<{ id: string }>;
  onSaved: (id: string) => void;
  onUnauthorized: () => void;
};

export function ListingForm({ initialValues, initialData, onChange, onSave, onSaved, onUnauthorized }: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [focus, setFocus] = useState<{ keys: string[] }>();
  const submitting = useRef(false);
  const active = useRef<AbortController | null>(null);
  const savedValues = useRef(JSON.stringify(listingToForm(initialData)));
  const dirty = useRef(JSON.stringify(initialValues ?? listingToForm(initialData)) !== JSON.stringify(listingToForm(initialData)));
  const form = useForm<ListingFormValues>({
    initialValues: initialValues ?? listingToForm(initialData),
    onValuesChange: (values) => { dirty.current = submitting.current || JSON.stringify(values) !== savedValues.current; onChange?.(values); },
  });
  const prepared = prepareListing(form.values);
  useUnsavedChanges(dirty);
  useEffect(() => () => { active.current?.abort(); }, []);
  useEffect(() => {
    if (!pending && focus) {
      const ids = new Set(focus.keys.map(controlId));
      const inputs = Array.from(document.querySelectorAll<HTMLElement>('input[id],select[id],textarea[id]')).filter((input) => ids.has(input.id));
      for (const input of inputs) { const section = input.closest('details'); if (section) section.open = true; }
      inputs[0]?.focus();
    }
  }, [focus, pending]);

  const showErrors = (errors: FormErrors) => {
    form.setErrors(errors);
    const keys = Object.keys(errors);
    setFocus(keys.length ? { keys } : undefined);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const result = prepareListing(form.getValues());
    if (Object.keys(result.errors).length) { showErrors(result.errors); setError('Исправьте отмеченные значения. Заполнять все поля для черновика не нужно.'); return; }
    submitting.current = true;
    dirty.current = true;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(undefined);
    form.clearErrors();
    try {
      const saved = await onSave(result.data, controller.signal);
      if (controller.signal.aborted) return;
      savedValues.current = JSON.stringify(form.getValues());
      dirty.current = false;
      onSaved(saved.id);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof RequestError) {
        showErrors(serverFieldErrors(failure.fieldErrors ?? [], form.getValues()));
        setError(failure.status === 401 ? 'Сессия истекла. Проверяем вход в аккаунт.'
          : failure.status === 403 ? 'Нет прав на создание объявления. Обратитесь к администратору.'
            : failure.status === 400 || failure.status === 422 ? 'Сервер не принял данные. Проверьте отмеченные поля и повторите сохранение.'
              : failure.status === 429 ? 'Слишком много попыток. Подождите и повторите сохранение.'
                : failure.kind === 'network' ? 'Нет связи с сервером. Данные остались в форме. Проверьте подключение и повторите сохранение.'
                  : failure.kind === 'invalid-response' ? 'Не удалось подтвердить сохранение: сервер вернул неожиданный ответ. Перед повтором проверьте список объявлений.'
                    : 'Сервис временно недоступен. Данные остались в форме. Повторите сохранение позже.');
        if (failure.status === 401) onUnauthorized();
      } else setError('Не удалось сохранить объявление. Данные остались в форме. Попробуйте ещё раз.');
    } finally {
      if (!controller.signal.aborted) { submitting.current = false; dirty.current = JSON.stringify(form.getValues()) !== savedValues.current; setPending(false); }
    }
  };

  const field = (path: string) => {
    const rule = listingRules[path]!;
    const key = inputPath(path);
    const label = path === 'deal.price' ? form.values.fields.deal_type === 'rent' ? 'Цена за месяц, ₽' : form.values.fields.deal_type === 'daily_rent' ? 'Цена за сутки, ₽' : 'Стоимость объекта, ₽'
      : path === 'object.totalArea' && form.values.fields.object_type === 'room' ? 'Площадь комнаты, м²' : labels[path];
    const props = { id: controlId(key), label, disabled: pending, ...form.getInputProps(key) };
    if (rule.type === 'boolean') return <NativeSelect key={path} {...props} data={flags} />;
    if (rule.enum) return <NativeSelect key={path} {...props} data={[emptyOption, ...fieldOptions(path)]} />;
    if (rule.type === 'array') return <MultiSelect key={path} {...props} data={fieldOptions(path)} clearable searchable nothingFoundMessage="Не найдено" placeholder="Неизвестно" />;
    if (path === 'extra') return <Textarea key={path} {...props} className={classes.wide} description="Особенности объекта, инфраструктура рядом и пожелания к тексту" placeholder="Что ещё важно рассказать?" rows={4} />;
    return <TextInput key={path} {...props} className={path === 'location.address' ? classes.wide : undefined}
      inputMode={rule.type === 'integer' && rule.minimum !== undefined ? 'numeric' : rule.type === 'number' ? 'decimal' : undefined}
      description={path === 'object.roomsCount' ? '0 — студия' : path === 'deal.deposit' ? '0 — без залога' : path === 'deal.commissionPercent' ? '0 — без комиссии' : path.endsWith('Time') ? 'ЧЧ:ММ, например 14:00' : undefined}
      placeholder="Не указано" />;
  };

  return (
    <Stack gap="md">
      <Text c="dimmed">Черновик можно сохранить без обязательных полей. Неизвестные сведения можно добавить позже.</Text>
      <form onSubmit={(event) => { void submit(event); }} noValidate aria-label="Создание объявления" aria-busy={pending} className={classes.layout}>
        <div className={classes.sections}>
          {sections.map(([section, title]) => {
            const paths = Object.keys(labels).filter((path) => (path === section || path.startsWith(`${section}.`)) && visibleField(path, form.values));
            if (!paths.length) return null;
            return <Paper component="details" key={section} className={classes.section} open={['deal', 'object', 'location', 'extra'].includes(section) ? true : undefined}>
              <summary className={classes.summary}>{title}</summary>
              <div className={classes.grid}>
                {paths.map(field)}
                {section === 'location' && <div className={classes.wide}><Stack gap="md">
                  {form.values.undergrounds.map((_, index) => <fieldset className={classes.station} key={index}>
                    <legend>Станция метро {index + 1}</legend>
                    <TextInput id={controlId(`undergrounds.${index}.name`)} label={`Название станции ${index + 1}`} disabled={pending} {...form.getInputProps(`undergrounds.${index}.name`)} />
                    <TextInput id={controlId(`undergrounds.${index}.minutes`)} label={`Время в пути, мин — станция ${index + 1}`} inputMode="numeric" disabled={pending} {...form.getInputProps(`undergrounds.${index}.minutes`)} />
                    <NativeSelect id={controlId(`undergrounds.${index}.transportType`)} label={`Как добраться — станция ${index + 1}`} disabled={pending} data={[emptyOption, { value: 'walk', label: 'Пешком' }, { value: 'transport', label: 'На транспорте' }]} {...form.getInputProps(`undergrounds.${index}.transportType`)} />
                    <AppButton intent="quiet" disabled={pending} onClick={() => { form.removeListItem('undergrounds', index); form.clearErrors(); }}>Удалить станцию {index + 1}</AppButton>
                  </fieldset>)}
                  <div><AppButton intent="secondary" disabled={pending} onClick={() => form.insertListItem('undergrounds', { name: '', minutes: '', transportType: '' })}>Добавить станцию метро</AppButton></div>
                </Stack></div>}
              </div>
            </Paper>;
          })}
        </div>
        <Paper component="aside" className={classes.actions} aria-label="Сохранение черновика">
          <Stack gap="md">
            <Title order={2} size="h3">Сохранить черновик</Title>
            <Text size="sm" c="dimmed">Сохранение и генерация — отдельные действия</Text>
            {prepared.missing.length > 0 ? <div><Text size="sm" fw={500}>Для генерации позже понадобятся</Text><ul>{prepared.missing.map((label) => <li key={label}><Text size="sm">{label}</Text></li>)}</ul></div>
              : <Text size="sm">Основные сведения заполнены. Для генерации понадобятся фотографии.</Text>}
            {!!prepared.warnings.length && <AppNotice tone="warning" title="Проверьте данные"><ul>{prepared.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul><Text size="sm">Если значения верны, черновик можно сохранить.</Text></AppNotice>}
            {error && <AppNotice tone="error" title="Не удалось сохранить">{error}</AppNotice>}
            <AppButton type="submit" fullWidth loading={pending}>{pending ? 'Сохраняем…' : 'Сохранить черновик'}</AppButton>
          </Stack>
        </Paper>
      </form>
      <Text role="status" className={classes.status}>{pending ? 'Сохраняем объявление' : ''}</Text>
    </Stack>
  );
}
