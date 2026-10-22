import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Checks {
  frontend: boolean;
  workflow: boolean;
  compose: boolean;
}

interface Event {
  pull_request?: { base: { sha: string }; head: { sha: string } };
  before?: string;
  after?: string;
}

export interface Job {
  result: string;
  outputs?: Record<string, string>;
}

const frontendWorkflows = new Set([
  '.github/workflows/verify.yml',
  '.github/workflows/browsers.yml',
  '.github/workflows/screenshots.yml',
]);

export function selectChecks(files: string[]): Checks {
  const frontend = files.some((file) => file.startsWith('frontend/') || frontendWorkflows.has(file) || file.startsWith('.github/actions/'));
  return {
    frontend,
    workflow: files.some((file) => file.startsWith('.github/workflows/') || file.startsWith('.github/actions/')),
    compose: frontend || files.some((file) => file.startsWith('backend/') || /^(?:compose|docker-compose)(?:[.-][^/]*)?\.ya?ml$/.test(file) || ['.dockerignore', '.env.example'].includes(file)),
  };
}

function commit(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{40}$/.test(value)) throw new Error('Не указан корректный SHA коммита');
  return value;
}

export function detectChecks(eventName: string, event: Event, cwd: string): Checks {
  if (eventName === 'workflow_dispatch') return { frontend: true, workflow: true, compose: true };
  let range: string;
  if (eventName === 'pull_request') {
    range = `${commit(event.pull_request?.base.sha)}...${commit(event.pull_request?.head.sha)}`;
  } else if (eventName === 'push') {
    const before = commit(event.before);
    const after = commit(event.after);
    if ([before, after].includes('0'.repeat(40))) return { frontend: true, workflow: true, compose: true };
    range = `${before}..${after}`;
  } else {
    throw new Error(`Неизвестное событие ${eventName}`);
  }
  const files = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', range, '--'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return selectChecks(files.split('\0').filter(Boolean));
}

export function validateResults(needs: Record<string, Job>) {
  if (needs.changes?.result !== 'success') throw new Error('Не удалось определить изменённые части проекта');
  const outputs = needs.changes.outputs;
  for (const name of ['frontend', 'workflow', 'compose']) {
    if (!['true', 'false'].includes(outputs?.[name] ?? '')) throw new Error(`Отсутствует условие запуска ${name}`);
  }
  for (const [name, condition] of Object.entries({ frontend: 'frontend', browser: 'frontend', workflow: 'workflow', compose: 'compose' })) {
    const result = needs[name]?.result;
    if (result !== 'success' && !(outputs?.[condition] === 'false' && result === 'skipped')) {
      throw new Error(`Проверка ${name}: ${result ?? 'отсутствует'}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'changes') {
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH ?? '', 'utf8')) as Event;
    const checks = detectChecks(process.env.GITHUB_EVENT_NAME ?? '', event, process.env.GITHUB_WORKSPACE ?? process.cwd());
    const output = Object.entries(checks).map(([name, value]) => `${name}=${value}`).join('\n') + '\n';
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
    console.log(output.trim());
  } else if (process.argv[2] === 'required') {
    validateResults(JSON.parse(process.env.CI_NEEDS ?? '{}') as Record<string, Job>);
    console.log('Все необходимые проверки прошли');
  } else {
    throw new Error('Укажите changes или required');
  }
}
