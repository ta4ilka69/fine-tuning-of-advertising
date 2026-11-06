import type { ListingData } from '../../shared/api/listing-data';
import { listingRules, type FieldRule } from '../../shared/api/listing-rules';
import { applicableField, validField } from '../../shared/api/validate-listing-data';
import { fieldKey, labels } from './fields';

export type UndergroundInput = { name: string; minutes: string; transportType: string };
export type ListingFormValues = { fields: Record<string, string | string[]>; undergrounds: UndergroundInput[] };
export type FormErrors = Record<string, string>;
export const inputPath = (path: string) => `fields.${fieldKey(path)}`;
export const rawField = (values: ListingFormValues, path: string) => values.fields[fieldKey(path)] ?? '';

export function listingToForm(data: ListingData = {}): ListingFormValues {
  const fields: ListingFormValues['fields'] = {};
  for (const [path, rule] of Object.entries(listingRules)) {
    if (path.startsWith('underground.')) continue;
    const [block, key] = path.split('.');
    const value = key ? (data[block as keyof ListingData] as Record<string, unknown> | undefined)?.[key] : data.extra;
    fields[fieldKey(path)] = value === undefined ? (rule.type === 'array' ? [] : '') : Array.isArray(value) ? [...value] as string[] : String(value);
  }
  return { fields, undergrounds: (data.location?.undergrounds ?? []).map((station) => ({ name: station.name, minutes: station.minutes === undefined ? '' : String(station.minutes), transportType: station.transportType ?? '' })) };
}

export function visibleField(path: string, values: ListingFormValues) {
  const deal = String(rawField(values, 'deal.type'));
  const object = String(rawField(values, 'object.type'));
  if (!deal && (/^(amenities|rules|legal)\./.test(path) || (path.startsWith('deal.') && !['deal.type', 'deal.price'].includes(path)))) return false;
  if (!object && (/^(house|building)\./.test(path) || (path.startsWith('object.') && !['object.type', 'object.totalArea', 'object.repairType'].includes(path)) || path === 'legal.hasRedevelopment')) return false;
  return applicableField(path, deal, object);
}

function convert(value: string | string[], rule: FieldRule) {
  if (Array.isArray(value)) return value.length ? value : undefined;
  if (value.trim() === '') return undefined;
  if (rule.type === 'number' || rule.type === 'integer') {
    if (!(rule.type === 'integer' ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/).test(value.trim())) return NaN;
    return Number(value.replace(',', '.'));
  }
  if (rule.type === 'boolean') return value === 'true' ? true : value === 'false' ? false : value;
  return value.trim();
}

export function prepareListing(values: ListingFormValues, initialData?: ListingData): { data: ListingData; errors: FormErrors; warnings: string[]; missing: string[] } {
  const data: Record<string, unknown> = {};
  const initialValues = listingToForm(initialData);
  const deal = String(rawField(values, 'deal.type'));
  const object = String(rawField(values, 'object.type'));
  if (initialData) {
    for (const [block, value] of Object.entries(initialData)) {
      if (block !== 'extra' && applicableField(block, deal, object) && typeof value === 'object' && !Array.isArray(value)) data[block] = {};
    }
  }
  const errors: FormErrors = {};
  for (const [path, rule] of Object.entries(listingRules)) {
    if (path.startsWith('underground.') || !(initialData ? applicableField(path, deal, object) : visibleField(path, values))) continue;
    const [sourceBlock, sourceKey] = path.split('.');
    const original = sourceKey ? (initialData?.[sourceBlock as keyof ListingData] as Record<string, unknown> | undefined)?.[sourceKey] : initialData?.extra;
    const unchanged = JSON.stringify(rawField(values, path)) === JSON.stringify(rawField(initialValues, path));
    const value = initialData && unchanged ? original : convert(rawField(values, path), rule);
    if (value === undefined) continue;
    if (!validField(value, rule)) { errors[inputPath(path)] = typeof value === 'number' && Math.abs(value) > Number.MAX_SAFE_INTEGER ? 'Слишком большое число' : fieldError(rule); continue; }
    const [block, key] = path.split('.');
    if (key) { data[block!] ??= {}; (data[block!] as Record<string, unknown>)[key] = value; }
    else data.extra = value;
  }
  const undergrounds = values.undergrounds.flatMap((station, index) => {
    if (Object.values(station).every((value) => !value.trim())) return [];
    const result: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(station)) {
      const rule = listingRules[`underground.${key}`]!;
      const value = convert(raw, rule);
      if ((key === 'name' && value === undefined) || (value !== undefined && !validField(value, rule))) errors[`undergrounds.${index}.${key}`] = key === 'name' ? 'Укажите название станции или удалите строку' : fieldError(rule);
      else if (value !== undefined) result[key] = value;
    }
    return [result];
  });
  const stationsUnchanged = initialData && JSON.stringify(values.undergrounds) === JSON.stringify(initialValues.undergrounds);
  const stations = stationsUnchanged ? initialData.location?.undergrounds : undergrounds;
  if (stations?.length || (initialData?.location?.undergrounds !== undefined)) { data.location ??= {}; (data.location as Record<string, unknown>).undergrounds = stations ?? []; }
  const listing = data as ListingData;
  const warnings: string[] = [];
  if (listing.object?.floor !== undefined && listing.building?.floorsCount !== undefined && listing.object.floor > listing.building.floorsCount) warnings.push('Этаж выше этажности здания');
  if (listing.object?.totalArea !== undefined) {
    if (listing.object.livingArea !== undefined && listing.object.livingArea > listing.object.totalArea) warnings.push('Жилая площадь больше общей');
    if (listing.object.kitchenArea !== undefined && listing.object.kitchenArea > listing.object.totalArea) warnings.push('Площадь кухни больше общей');
  }
  const required = ['deal.type', 'deal.price', 'object.type', 'object.totalArea', 'location.address',
    ...(listing.object?.type === 'flat' ? ['object.roomsCount'] : []), ...(listing.deal?.type === 'rent' ? ['deal.deposit', 'deal.commissionPercent'] : [])];
  const missing = required.filter((path) => {
    const [block, key] = path.split('.');
    return (data[block!] as Record<string, unknown> | undefined)?.[key!] === undefined;
  }).map((path) => labels[path]!);
  return { data: listing, errors, warnings, missing };
}

export function fieldError(rule: FieldRule) {
  if (rule.type === 'integer' || rule.type === 'number') return `${rule.type === 'integer' ? 'Введите целое число' : 'Введите число'}${rule.exclusiveMinimum === 0 ? ' больше нуля' : rule.minimum !== undefined ? ` не меньше ${rule.minimum}` : ''}${rule.maximum !== undefined ? ` и не больше ${rule.maximum}` : ''}`;
  return rule.pattern?.startsWith('^([01]') ? 'Введите время в формате ЧЧ:ММ, от 00:00 до 23:59' : 'Выберите допустимое значение';
}

export function serverFieldErrors(issues: { field: string }[], values: ListingFormValues): FormErrors {
  const result: FormErrors = {};
  const stationIndexes = values.undergrounds.flatMap((station, index) => Object.values(station).some((value) => value.trim()) ? [index] : []);
  for (const issue of issues) {
    let path = issue.field.replace(/^\/data\//, '').replaceAll('/', '.');
    const arrayField = path.replace(/\.\d+$/, '');
    if (listingRules[arrayField]?.type === 'array') path = arrayField;
    const station = /^location\.undergrounds\.(\d+)(?:\.(name|minutes|transportType))?$/.exec(path);
    const stationIndex = station ? stationIndexes[Number(station[1])] : undefined;
    if (station && stationIndex !== undefined) result[`undergrounds.${stationIndex}.${station[2] ?? 'name'}`] = 'Проверьте значение';
    else if (Object.hasOwn(labels, path) && applicableField(path, String(rawField(values, 'deal.type')), String(rawField(values, 'object.type')))) result[inputPath(path)] = 'Проверьте значение';
  }
  return result;
}
