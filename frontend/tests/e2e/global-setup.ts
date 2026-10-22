import type { FullConfig } from '@playwright/test';

export default function verifyScreenshotEnvironment(config: FullConfig) {
  if (config.updateSnapshots !== 'none' && (process.platform !== 'linux' || process.arch !== 'arm64')) {
    throw new Error('Эталоны обновляются в Linux ARM64 через workflow Update screenshots.');
  }
}
