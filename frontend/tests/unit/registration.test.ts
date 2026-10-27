import Ajv2020 from 'ajv/dist/2020';
import { expect, test } from 'vitest';
import contract from '../../public/docs/openapi.json';
import { validateLogin, validatePassword } from '../../src/pages/register/validation';

const schema = new Ajv2020({ strict: false }).compile(contract.components.schemas.Credentials);

test.each([
  ['', false], ['ab', false], ['abc', true], ['a'.repeat(32), true], ['a'.repeat(33), false],
  ['AZaz09_.-', true], [' agent', false], ['agent ', false], ['агент', false],
  ['agént', false], ['a/b', false], ['a@b', false], ['a b', false], ['a\nb', false],
])('логин %j: границы и символы контракта', (login, valid) => {
  expect(validateLogin(login) === null).toBe(valid);
  expect(schema({ login, password: ' '.repeat(12) })).toBe(valid);
});

test.each([
  ['', false], ['a'.repeat(11), false], ['a'.repeat(12), true],
  ['a'.repeat(128), true], ['a'.repeat(129), false],
  ['🏠'.repeat(6), false], ['🏠'.repeat(11), false], ['🏠'.repeat(12), true],
  ['🏠'.repeat(128), true], ['🏠'.repeat(129), false],
  ['е\u0301'.repeat(6), true], [' '.repeat(12), true], ['  пароль 123  ', true],
  ['\t'.repeat(12), true], ['密码'.repeat(6), true],
])('пароль %j: длина JSON Schema без нормализации', (password, valid) => {
  expect(validatePassword(password) === null).toBe(valid);
  expect(schema({ login: 'agent', password })).toBe(valid);
});

test('логин не принимает завершающий перевод строки', () => {
  expect(validateLogin('agent\n')).not.toBeNull();
});
