import { appendFile, readFile } from 'node:fs/promises';

const lines = ['## Фронтенд', ''];
try {
  const { total } = JSON.parse(await readFile(new URL('../coverage/coverage-summary.json', import.meta.url), 'utf8'));
  lines.push('| Покрытие | Значение | Покрыто / всего |', '| --- | ---: | ---: |');
  for (const [name, key] of [['Строки', 'lines'], ['Инструкции', 'statements'], ['Функции', 'functions'], ['Ветви', 'branches']]) {
    lines.push(`| ${name} | ${total[key].pct}% | ${total[key].covered} / ${total[key].total} |`);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  lines.push('Отчёт о покрытии не сформирован.');
}

lines.push('');
try {
  const rows = JSON.parse(await readFile(new URL('../test-results/bundle.json', import.meta.url), 'utf8'));
  lines.push('| Главная страница | gzip, байт | Лимит |', '| --- | ---: | ---: |');
  for (const row of rows) lines.push(`| ${row.type.toUpperCase()} | ${row.bytes} | ${row.limit} |`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  lines.push('Размер сборки не измерен.');
}

const summary = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
else console.log(summary);
