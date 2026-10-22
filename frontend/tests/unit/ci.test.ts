import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';
import { detectChecks, selectChecks, validateResults, type Checks, type Job } from '../../scripts/ci.ts';

const directories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'advertising-ci-'));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function repository() {
  const cwd = temporaryDirectory();
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=CI', '-c', 'user.email=ci@example.test', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path: string, contents = path) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), contents);
  };
  const commit = () => {
    git('add', '-A');
    git('commit', '--quiet', '-m', 'change');
    return git('rev-parse', 'HEAD');
  };
  git('init', '--quiet', '-b', 'main');
  write('README.md');
  return { cwd, git, write, commit, base: commit() };
}

describe('выбор проверок', () => {
  test.each([
    'frontend/src/app/App.tsx',
    'frontend/package.json',
    'frontend/package-lock.json',
    'frontend/.nvmrc',
    'frontend/Dockerfile',
    'frontend/tests/e2e/screenshots/chromium/home-mobile.png',
    '.github/workflows/verify.yml',
    '.github/workflows/browsers.yml',
    '.github/workflows/screenshots.yml',
    '.github/actions/setup/action.yml',
  ])('%s запускает фронт и Compose', (file) => {
    expect(selectChecks([file])).toMatchObject({ frontend: true, compose: true });
  });

  test.each(['backend/app.py', 'compose.yaml', 'compose.override.yml', 'docker-compose.yml', '.env.example', '.dockerignore'])('%s запускает только Compose', (file) => {
    expect(selectChecks([file])).toEqual({ frontend: false, workflow: false, compose: true });
  });

  test('отдельный workflow бекенда требует только actionlint', () => {
    expect(selectChecks(['.github/workflows/backend.yml'])).toEqual({ frontend: false, workflow: true, compose: false });
  });

  test.each([{ files: [] }, { files: ['README.md'] }, { files: ['LICENSE'] }, { files: ['research/notes.md'] }])('документы и отсутствие изменений не запускают тесты: $files', ({ files }) => {
    expect(selectChecks(files)).toEqual({ frontend: false, workflow: false, compose: false });
  });

  test('ручной запуск и первый push выполняют все проверки', () => {
    const all = { frontend: true, workflow: true, compose: true };
    expect(detectChecks('workflow_dispatch', {}, '')).toEqual(all);
    expect(detectChecks('push', { before: '0'.repeat(40), after: '1'.repeat(40) }, '')).toEqual(all);
  });

  test.each([
    { files: ['README.md'], expected: { frontend: false, workflow: false, compose: false } },
    { files: ['backend/app.py'], expected: { frontend: false, workflow: false, compose: true } },
    { files: ['frontend/package-lock.json'], expected: { frontend: true, workflow: false, compose: true } },
    { files: ['compose.yaml'], expected: { frontend: false, workflow: false, compose: true } },
    { files: ['frontend/src/page.tsx', 'backend/app.py'], expected: { frontend: true, workflow: false, compose: true } },
    { files: ['.github/workflows/verify.yml'], expected: { frontend: true, workflow: true, compose: true } },
  ])('PR $files получает нужные проверки и успешный итог', ({ files, expected }) => {
    const repo = repository();
    for (const file of files) repo.write(file, 'changed');
    const head = repo.commit();
    const checks = detectChecks('pull_request', { pull_request: { base: { sha: repo.base }, head: { sha: head } } }, repo.cwd);
    expect(checks).toEqual(expected);
    expect(() => validateResults(jobs(checks))).not.toThrow();
  });

  test('PR включает ранние коммиты и не включает новые изменения базовой ветки', () => {
    const repo = repository();
    repo.git('switch', '--quiet', '-c', 'feature');
    repo.write('frontend/src/page.tsx');
    repo.commit();
    repo.write('backend/app.py');
    const head = repo.commit();
    repo.git('switch', '--quiet', 'main');
    repo.write('.github/workflows/backend.yml');
    const base = repo.commit();
    expect(detectChecks('pull_request', { pull_request: { base: { sha: base }, head: { sha: head } } }, repo.cwd)).toEqual({ frontend: true, workflow: false, compose: true });
  });

  test('push сравнивает before и after даже при смене истории', () => {
    const repo = repository();
    repo.git('switch', '--quiet', '-c', 'previous');
    repo.write('frontend/src/page.tsx');
    const before = repo.commit();
    repo.git('switch', '--quiet', 'main');
    repo.write('backend/app.py');
    const after = repo.commit();
    expect(detectChecks('push', { before, after }, repo.cwd)).toEqual({ frontend: true, workflow: false, compose: true });
  });

  test('перенос из frontend и удаление файла учитывают старые пути', () => {
    const repo = repository();
    repo.write('frontend/page.tsx');
    repo.write('.github/workflows/verify.yml');
    const before = repo.commit();
    repo.write('backend/placeholder');
    repo.git('mv', 'frontend/page.tsx', 'backend/page.tsx');
    repo.git('rm', '.github/workflows/verify.yml');
    const after = repo.commit();
    expect(detectChecks('push', { before, after }, repo.cwd)).toEqual({ frontend: true, workflow: true, compose: true });
  });

  test('имена файлов с переводами строк не теряются', () => {
    const repo = repository();
    repo.write('frontend/a\nb.ts');
    const after = repo.commit();
    expect(detectChecks('push', { before: repo.base, after }, repo.cwd).frontend).toBe(true);
  });

  test('неизвестное событие, отсутствующий SHA и ошибка Git не разрешают пропуск', () => {
    expect(() => detectChecks('unknown', {}, '')).toThrow();
    expect(() => detectChecks('pull_request', {}, '')).toThrow();
    const cwd = temporaryDirectory();
    expect(() => detectChecks('push', { before: '1'.repeat(40), after: '2'.repeat(40) }, cwd)).toThrow();
  });
});

function jobs(checks: Checks): Record<string, Job> {
  return {
    changes: { result: 'success', outputs: Object.fromEntries(Object.entries(checks).map(([name, value]) => [name, String(value)])) },
    frontend: { result: checks.frontend ? 'success' : 'skipped' },
    browser: { result: checks.frontend ? 'success' : 'skipped' },
    workflow: { result: checks.workflow ? 'success' : 'skipped' },
    compose: { result: checks.compose ? 'success' : 'skipped' },
  };
}

describe('обязательная проверка', () => {
  test.each([
    { frontend: false, workflow: false, compose: false },
    { frontend: false, workflow: false, compose: true },
    { frontend: false, workflow: true, compose: false },
    { frontend: true, workflow: true, compose: true },
  ])('принимает успешные необходимые проверки и ненужные пропуски: %j', (checks) => {
    expect(() => validateResults(jobs(checks))).not.toThrow();
  });

  test.each(['frontend', 'browser', 'workflow', 'compose'])('%s не может упасть, отмениться, пропуститься или исчезнуть, если нужен', (name) => {
    for (const result of ['failure', 'cancelled', 'skipped', 'timed_out']) {
      const needs = jobs({ frontend: true, workflow: true, compose: true });
      needs[name] = { result };
      expect(() => validateResults(needs)).toThrow(name);
    }
    const needs = jobs({ frontend: true, workflow: true, compose: true });
    delete needs[name];
    expect(() => validateResults(needs)).toThrow(name);
  });

  test('ошибка определения изменений или неполные outputs блокируют итог', () => {
    for (const result of ['failure', 'cancelled', 'skipped']) {
      const needs = jobs({ frontend: false, workflow: false, compose: false });
      needs.changes = { result };
      expect(() => validateResults(needs)).toThrow();
    }
    expect(() => validateResults({ changes: { result: 'success', outputs: { frontend: 'false' } } })).toThrow();
  });

  test('ошибка запущенного job не игнорируется даже при отсутствии изменений', () => {
    const needs = jobs({ frontend: false, workflow: false, compose: false });
    needs.frontend = { result: 'failure' };
    expect(() => validateResults(needs)).toThrow('frontend');
  });
});

test('CLI записывает outputs и принимает итог через JSON без npm-зависимостей', () => {
  const cwd = temporaryDirectory();
  const eventPath = join(cwd, 'event.json');
  const outputPath = join(cwd, 'outputs');
  writeFileSync(eventPath, '{}');
  const script = fileURLToPath(new URL('../../scripts/ci.ts', import.meta.url));
  const env = { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath };
  execFileSync(process.execPath, [script, 'changes'], { cwd, env });
  expect(readFileSync(outputPath, 'utf8')).toBe('frontend=true\nworkflow=true\ncompose=true\n');
  const needs = jobs({ frontend: false, workflow: false, compose: true });
  expect(() => execFileSync(process.execPath, [script, 'required'], { cwd, env: { ...env, CI_NEEDS: JSON.stringify(needs) } })).not.toThrow();
});
