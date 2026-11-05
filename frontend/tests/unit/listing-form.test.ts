import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchemaObject } from 'ajv';
import addFormats from 'ajv-formats';
import { expect, test } from 'vitest';
import { fieldKey, fieldOptions, labels } from '../../src/features/listing-form/fields';
import { listingToForm, prepareListing, serverFieldErrors, visibleField } from '../../src/features/listing-form/model';
import { isListingData, validField } from '../../src/shared/api/validate-listing-data';
import { listingRules } from '../../src/shared/api/listing-rules';
import type { ListingData } from '../../src/shared/api/listing-data';

const contract = JSON.parse(readFileSync(new URL('../../public/docs/openapi.json', import.meta.url), 'utf8')) as AnySchemaObject;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv); ajv.addSchema({ $id: 'urn:advertising:create-test', ...contract });
const validate = ajv.compile({ $ref: 'urn:advertising:create-test#/components/schemas/CreateListing' });
const ready = ajv.compile({ $ref: 'urn:advertising:create-test#/components/schemas/ReadyListingData' });
const input = (fields: Record<string, string | string[]> = {}) => ({ ...listingToForm(), fields: { ...listingToForm().fields, ...Object.fromEntries(Object.entries(fields).map(([path, value]) => [fieldKey(path), value])) } });
const sample = (path: string) => {
  const rule = listingRules[path]!;
  return rule.type === 'array' ? [...rule.items!.enum] : rule.enum ? rule.enum[0]! : rule.type === 'boolean' ? 'false' : rule.type === 'number' ? '12,5' : rule.type === 'integer' ? '2' : path.endsWith('Time') ? '14:30' : 'Текст';
};

test('пустой черновик, пробелы и неизвестные значения не требуют готовности к генерации', () => {
  for (const values of [input(), input({ extra: '   ', 'deal.price': ' ' })]) {
    const result = prepareListing(values);
    expect(result.data).toEqual({}); expect(result.errors).toEqual({}); expect(validate({ data: result.data })).toBe(true); expect(ready(result.data)).toBe(false);
  }
});

for (const deal of ['sale', 'rent', 'daily_rent']) for (const object of ['flat', 'room', 'house', 'apartments']) {
  test(`все применимые поля ${deal}/${object} соответствуют OpenAPI`, () => {
    const values = input(Object.fromEntries(Object.keys(listingRules).filter((path) => !path.startsWith('underground.')).map((path) => [path, sample(path)])));
    values.fields.deal_type = deal; values.fields.object_type = object === 'apartments' ? 'flat' : object;
    values.fields.object_isApartments = object === 'apartments' ? 'true' : 'false';
    values.undergrounds = [{ name: 'Лесная', minutes: '0', transportType: 'walk' }, { name: 'Петроградская', minutes: '', transportType: '' }];
    const result = prepareListing(values);
    expect(result.errors).toEqual({}); expect(validate({ data: result.data }), ajv.errorsText(validate.errors)).toBe(true);
    expect(isListingData(result.data)).toBe(true); expect(ready(result.data)).toBe(true);
    for (const path of Object.keys(listingRules).filter((path) => !path.startsWith('underground.'))) {
      if (visibleField(path, values)) expect(labels[path]).toBeTruthy();
    }
    expect(result.data.location!.undergrounds![0]!.minutes).toBe(0);
  });
}

test('переходы типов сохраняют общие значения и исключают скрытые данные и их ошибки', () => {
  const values = input({ 'deal.type': 'rent', 'object.type': 'flat', 'deal.price': '65000', 'deal.deposit': '0', 'deal.commissionPercent': '0', 'object.totalArea': '54', 'object.roomsCount': '0', 'object.floor': 'не число', 'building.floorsCount': '12', 'amenities.hasFurniture': 'false', 'rules.petsAllowed': 'false', 'legal.hasMinorOwners': 'true' });
  expect(prepareListing(values).errors).toHaveProperty('fields.object_floor');
  values.fields.object_type = 'house'; values.fields.deal_type = 'sale';
  const changed = prepareListing(values);
  expect(changed.errors).toEqual({}); expect(changed.data).toEqual({ deal: { type: 'sale', price: 65000 }, object: { type: 'house', totalArea: 54 }, legal: { hasMinorOwners: true } });
  expect(validate({ data: changed.data })).toBe(true);
  values.fields.object_type = 'flat'; values.fields.deal_type = 'rent'; values.fields.object_floor = '';
  expect(prepareListing(values).data).toMatchObject({ deal: { deposit: 0, commissionPercent: 0 }, object: { roomsCount: 0 }, amenities: { hasFurniture: false }, rules: { petsAllowed: false } });
});

test('без типов показываются только общие поля, служебные ключи не сериализуются', () => {
  const values = input({ 'deal.deposit': '100', 'building.floorsCount': '2', 'object.roomsCount': '3', 'object.totalArea': '20', 'legal.hasRedevelopment': 'true', 'object.isApartments': 'true', invalid: 'wrong' });
  expect(prepareListing(values).data).toEqual({ object: { totalArea: 20 } });
});

for (const [path, bad] of [
  ['deal.price', ['0', '-1', '1.2', '1e3', 'Infinity', 'NaN', '9007199254740992', '123x', '0x10']],
  ['deal.deposit', ['-1', '1.5']], ['deal.commissionPercent', ['-1', '101']], ['object.totalArea', ['0', '-1', '1,2,3', '--2']],
  ['object.floor', ['1.5']], ['building.floorsCount', ['0']], ['rules.checkInTime', ['24:00', '12:60', '9:00']],
] as [string, string[]][]) for (const value of bad) {
  test(`неверный ввод ${path}=${value}`, () => {
    const result = prepareListing(input({ 'deal.type': path.startsWith('deal.') ? 'rent' : 'daily_rent', 'object.type': 'flat', [path]: value }));
    expect(result.errors).toHaveProperty(`fields.${fieldKey(path)}`);
  });
}

for (const [path, valid] of [['deal.price', '9007199254740991'], ['deal.deposit', '0'], ['deal.commissionPercent', '100'], ['object.floor', '-2'], ['object.totalArea', ',5'], ['rules.checkInTime', '23:59']] as const) {
  test(`граница ${path}=${valid}`, () => {
    const result = prepareListing(input({ 'deal.type': path.startsWith('deal.') ? 'rent' : 'daily_rent', 'object.type': 'flat', [path]: valid }));
    expect(result.errors).toEqual({}); expect(validate({ data: result.data })).toBe(true);
  });
}

test('предупреждения о противоречиях не блокируют сохранение', () => {
  const result = prepareListing(input({ 'object.type': 'flat', 'object.totalArea': '20', 'object.livingArea': '21', 'object.kitchenArea': '22', 'object.floor': '10', 'building.floorsCount': '9' }));
  expect(result.warnings).toHaveLength(3); expect(result.errors).toEqual({}); expect(validate({ data: result.data })).toBe(true);
});

test('метро: пустые строки пропускаются, заполненная станция требует название', () => {
  const values = input(); values.undergrounds = [{ name: ' ', minutes: '', transportType: '' }];
  expect(prepareListing(values).data).toEqual({});
  values.undergrounds[0]!.minutes = '0';
  expect(prepareListing(values).errors).toHaveProperty('undergrounds.0.name');
  values.undergrounds[0]!.name = 'Лесная'; values.undergrounds[0]!.minutes = '-1'; values.undergrounds[0]!.transportType = 'unknown';
  expect(Object.keys(prepareListing(values).errors)).toEqual(['undergrounds.0.minutes', 'undergrounds.0.transportType']);
});

test('roundtrip данных поддерживает false, 0, массивы, неизвестные поля и метро', () => {
  const data: ListingData = { deal: { type: 'rent', deposit: 0, commissionPercent: 0 }, object: { type: 'flat', roomsCount: 0, isApartments: false }, amenities: { hasFurniture: false }, location: { undergrounds: [{ name: 'Лесная', minutes: 0, transportType: 'walk' }, { name: 'Парк' }] } };
  expect(prepareListing(listingToForm(data)).data).toEqual(data);
  const house: ListingData = { object: { type: 'house' }, house: { materialTypes: ['brick', 'wood'] } };
  expect(prepareListing(listingToForm(house)).data).toEqual(house);
});

test('известные ошибки API привязываются безопасно, неизвестные и скрытые игнорируются', () => {
  const values = input({ 'object.type': 'house', 'deal.type': 'rent' }); values.undergrounds = [{ name: 'Лесная', minutes: '', transportType: '' }];
  const errors = serverFieldErrors(['/data/deal/price', '/data/house/landArea', '/data/object/floor', '/data/location/undergrounds/0/name', '/data/location/undergrounds/4/name', '/data/wrong'].map((field) => ({ field })), values);
  expect(errors).toEqual({ 'fields.deal_price': 'Проверьте значение', 'fields.house_landArea': 'Проверьте значение', 'undergrounds.0.name': 'Проверьте значение' });
});

test('каждое перечисление имеет русскую подпись и отклоняет неизвестные значения', () => {
  for (const [path, rule] of Object.entries(listingRules)) {
    if (!path.startsWith('underground.')) expect(labels[path]).toBeTruthy();
    if (rule.enum || rule.items) {
      if (!path.startsWith('underground.')) expect(fieldOptions(path).every((option) => !!option.label)).toBe(true);
      expect(validField(rule.items ? ['unknown'] : 'unknown', rule)).toBe(false);
    }
    if (rule.type === 'boolean') { expect(validField(false, rule)).toBe(true); expect(validField('false', rule)).toBe(false); }
  }
});

for (const data of [null, [], { extra: null }, { extra: ' ' }, { wrong: true }, { deal: null }, { deal: { type: 'wrong' } }, { object: { totalArea: 0 } }, { object: { type: 'room', roomsCount: 0 } }, { object: { type: 'house' }, building: {} }, { deal: { type: 'sale', deposit: 0 } }, { deal: { type: 'rent' }, legal: {} }, { deal: { type: 'rent' }, rules: { bedsCount: 1 } }, { deal: { type: 'daily_rent', commissionPercent: 0 } }, { location: { undergrounds: [{}] } }, { location: { undergrounds: [{ name: 'Метро', other: 1 }] } }, { house: { materialTypes: ['wood', 'wood'] } }]) {
  test(`runtime ListingData отклоняет ${JSON.stringify(data)}`, () => { expect(isListingData(data)).toBe(false); expect(validate({ data })).toBe(false); });
}

test('проверка правил типов согласована с текущей схемой OpenAPI', () => {
  const schemas = contract.components.schemas as Record<string, AnySchemaObject>;
  for (const [path, rule] of Object.entries(listingRules)) {
    const [block, key] = path.split('.');
    const schema = key ? schemas[`Listing${block![0]!.toUpperCase()}${block!.slice(1)}`]!.properties[key] : schemas.ListingData!.properties.extra;
    for (const property of ['type', 'enum', 'minimum', 'maximum', 'exclusiveMinimum', 'pattern', 'items', 'uniqueItems']) expect(rule[property as keyof typeof rule]).toEqual(schema[property]);
  }
});

test('ошибки элементов массива связываются с соответствующим вводом', () => {
  const values = input({ 'object.type': 'house' }); values.undergrounds = [{ name: 'Лесная', minutes: '', transportType: '' }];
  expect(serverFieldErrors([{ field: '/data/house/materialTypes/0' }, { field: '/data/location/undergrounds/0' }], values))
    .toEqual({ 'fields.house_materialTypes': 'Проверьте значение', 'undergrounds.0.name': 'Проверьте значение' });
});

test('неизвестные имена полей не используют прототип объекта', () => {
  expect(serverFieldErrors(['/data/__proto__', '/data/constructor', '/data/toString'].map((field) => ({ field })), input())).toEqual({});
});

test('ошибки API учитывают пропущенные пустые строки метро', () => {
  const values = input();
  values.undergrounds = [{ name: '', minutes: '', transportType: '' }, { name: 'Лесная', minutes: '7', transportType: 'walk' }, { name: ' ', minutes: '', transportType: '' }, { name: 'Парк', minutes: '', transportType: '' }];
  expect(prepareListing(values).data.location!.undergrounds).toHaveLength(2);
  expect(serverFieldErrors([{ field: '/data/location/undergrounds/0/minutes' }, { field: '/data/location/undergrounds/1' }], values))
    .toEqual({ 'undergrounds.1.minutes': 'Проверьте значение', 'undergrounds.3.name': 'Проверьте значение' });
});
