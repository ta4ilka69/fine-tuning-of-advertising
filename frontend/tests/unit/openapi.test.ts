import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchemaObject } from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, test } from 'vitest';

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

test('последний успешный результат принимает только успех или null', () => {
  const validate = validator({ $ref: '#/components/schemas/Listing' });
  const example = examples.find(({ name }) => name.includes('failedRetryWithPreviousResult'));
  expect(example).toBeDefined();
  const listing = structuredClone(example!.value) as Record<string, unknown>;
  expect(validate(listing)).toBe(true);
  listing.lastSuccessfulGeneration = null;
  expect(validate(listing)).toBe(true);
  delete listing.lastSuccessfulGeneration;
  expect(validate(listing)).toBe(false);
  listing.lastSuccessfulGeneration = listing.latestGeneration;
  expect(validate(listing)).toBe(false);
});
