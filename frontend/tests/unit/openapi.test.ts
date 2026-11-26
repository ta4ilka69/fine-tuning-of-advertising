import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchemaObject } from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, test } from 'vitest';
import { generationResult, listingDetails } from '../fixtures/listings';
import { correctableListing, failed, processing, ready } from '../fixtures/photo-corrections';

interface Contract {
  components: { schemas: Record<string, AnySchemaObject> };
}

const contract = JSON.parse(readFileSync(new URL('../../public/docs/openapi.json', import.meta.url), 'utf8')) as Contract;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'urn:advertising:api', ...contract });

function validator(schema: AnySchemaObject) {
  const absoluteRefs = JSON.stringify(schema).replaceAll('"#/components/', '"urn:advertising:api#/components/');
  return ajv.compile(JSON.parse(absoluteRefs) as AnySchemaObject);
}

const examples: { name: string; schema: AnySchemaObject; value: unknown }[] = [];

function collect(value: unknown, path: string) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${path}/${index}`));
    return;
  }
  const object = value as Record<string, unknown>;
  if (object.schema && typeof object.schema === 'object') {
    const schema = object.schema as AnySchemaObject;
    if ('example' in object) examples.push({ name: `${path}/example`, schema, value: object.example });
    for (const [name, example] of Object.entries(object.examples ?? {})) {
      if (example && typeof example === 'object' && 'value' in example) {
        examples.push({ name: `${path}/${name}`, schema, value: example.value });
      }
    }
  } else if (Array.isArray(object.examples)) {
    object.examples.forEach((example, index) => {
      examples.push({ name: `${path}/examples/${index}`, schema: object, value: example });
    });
  }
  for (const [key, child] of Object.entries(object)) {
    if (key !== 'example' && key !== 'examples') collect(child, `${path}/${key}`);
  }
}

collect(contract, '');

describe('примеры OpenAPI', () => {
  test('контракт содержит проверяемые примеры', () => {
    expect(examples.length).toBeGreaterThan(0);
  });
  test.each(examples)('$name', ({ schema, value }) => {
    const validate = validator(schema);
    expect(validate(value), ajv.errorsText(validate.errors)).toBe(true);
  });
});

test('контракт фотографии допускает три оценки и нейтральные состояния', () => {
  const validate = validator({ $ref: '#/components/schemas/Photo' });
  const [photo] = listingDetails().photos;
  const qualityReason = 'Освещение и резкость';
  expect(validate(photo)).toBe(true);
  expect(validate({ ...photo, quality: null, qualityReason: null })).toBe(true);
  for (const quality of ['good', 'needs_fix', 'unfit']) {
    expect(validate({ ...photo, quality, qualityReason })).toBe(true);
  }
  expect(validate({ ...photo, quality: 'unsupported', qualityReason })).toBe(false);
  const processing = { ...photo, status: 'processing', thumbnailUrl: null, quality: null, qualityReason: null };
  const failed = { ...processing, status: 'failed', error: {
    type: 'about:blank', title: 'Обработка не удалась', status: 422, code: 'PHOTO_PROCESSING_FAILED',
    requestId: 'a6cdd08a-a252-48fa-a6c5-73f485bc494e',
  } };
  for (const value of [processing, failed]) {
    expect(validate(value)).toBe(true);
    expect(validate({ ...value, quality: 'unfit', qualityReason })).toBe(false);
  }
});

test('сохранённый результат и ошибка соответствуют состоянию объявления', () => {
  const validate = validator({ $ref: '#/components/schemas/Listing' });
  const example = examples.find(({ name }) => name.includes('failedRetryWithPreviousResult'));
  expect(example).toBeDefined();
  const listing = structuredClone(example!.value) as Record<string, unknown>;
  expect(validate(listing)).toBe(true);
  listing.result = null;
  expect(validate(listing)).toBe(true);
  listing.status = 'ready';
  listing.generationError = null;
  expect(validate(listing)).toBe(false);
  listing.result = structuredClone((example!.value as Record<string, unknown>).result);
  expect(validate(listing)).toBe(true);
  listing.result = { channels: [] };
  expect(validate(listing)).toBe(false);
  delete listing.result;
  expect(validate(listing)).toBe(false);
});

test('контракт допускает пустые пояснения в сохранённом результате', () => {
  const validate = validator({ $ref: '#/components/schemas/GenerationResult' });
  const channel = generationResult.channels[0]!;
  const result = {
    score: 0,
    why: [{ plus: true, text: channel.scoreReason }, { plus: false, text: '' }],
    howToImprove: [],
    channels: [{
      ...channel, score: 0, titles: [channel.title], checklist: [],
      photos: { top: [{ photo_id: channel.photoIds[0], why: '' }], rest: [], excluded: [] },
    }],
  };
  expect(validate(result), ajv.errorsText(validate.errors)).toBe(true);
});

test('контракт объявления принимает старые снимки и требует результат или ошибку по состоянию правки', () => {
  const validate = validator({ $ref: '#/components/schemas/Listing' });
  expect(validate(listingDetails())).toBe(true);
  const listing = correctableListing();
  for (const photoCorrection of [null, processing(), ready(), failed()]) {
    expect(validate({ ...listing, photoCorrection }), ajv.errorsText(validate.errors)).toBe(true);
  }
  for (const photoCorrection of [{ ...ready(), status: 'processing' }, { ...processing(), status: 'ready' }, { ...processing(), status: 'failed' }]) {
    expect(validate({ ...listing, photoCorrection })).toBe(false);
  }
});
