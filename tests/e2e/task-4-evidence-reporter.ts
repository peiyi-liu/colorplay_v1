import { copyFile, mkdir } from 'node:fs/promises';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

const traceDirectory = 'artifacts/acceptance/phase-1a-task-04/traces';

export default class Task4EvidenceReporter implements Reporter {
  private tracePath: string | undefined;

  onTestEnd(_test: TestCase, result: TestResult) {
    const trace = result.attachments.find(
      (attachment) => attachment.name === 'trace' && attachment.path,
    );
    this.tracePath = trace?.path;
  }

  async onEnd() {
    if (!this.tracePath) return;

    await mkdir(traceDirectory, { recursive: true });
    await copyFile(this.tracePath, `${traceDirectory}/app-router.zip`);
  }
}
