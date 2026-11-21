// Root kernel calibration only: no application route, Auth or test identity.
import process from 'node:process';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from '../../colorplay-live-recovery/node_modules/@playwright/test/index.mjs';
import { loadExecutionProfileRuntime } from '../../colorplay-live-recovery/scripts/concurrency/execution-profile-runtime.ts';
import { readPrivateFunctionalFile } from '../../colorplay-live-recovery/scripts/concurrency/functional-runtime.ts';
import { executeCapacityRoot } from '../../colorplay-live-recovery/scripts/concurrency/capacity-runtime.ts';
import { createLinuxCapacityHealth } from '../../colorplay-live-recovery/scripts/concurrency/capacity-linux-health.ts';
let server, browser, context;
const histogram = monitorEventLoopDelay({ resolution: 20 });
let result;
try {
  const [revision, profileSha, closureSha, mode] = process.argv.slice(2);
  if (
    process.platform !== 'linux' ||
    !/^[a-f0-9]{40}$/.test(revision ?? '') ||
    ![profileSha, closureSha].every((value) =>
      /^[a-f0-9]{64}$/.test(value ?? ''),
    ) ||
    !['NATIVE_BROWSER', 'NODE_PROTOCOL'].includes(mode)
  )
    throw Error('CALIBRATION_ARGUMENTS_INVALID');
  const runtime = import.meta.dirname;
  const profile = JSON.parse(
    await readPrivateFunctionalFile(runtime + '/execution-profile.json', 32768),
  );
  const controller = new globalThis.AbortController();
  const loaded = await loadExecutionProfileRuntime(
    {
      sourceRevision: revision,
      profileSha256: profileSha,
      descriptor: { helperClosureSha256: closureSha },
      databaseIdentitySha256: profile.identity.databaseIdentitySha256,
      helperHashes: {},
    },
    { read: readPrivateFunctionalFile, execute: executeCapacityRoot },
    controller.signal,
  );
  if (!loaded) throw Error('PROFILE_REQUIRED');
  let browserPid;
  if (mode === 'NATIVE_BROWSER') {
    server = await chromium.launchServer({ headless: true });
    browser = await chromium.connect(server.wsEndpoint());
    context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('about:blank');
    browserPid = server.process().pid;
  }
  histogram.enable();
  await pause(1000);
  const health = createLinuxCapacityHealth(mode, loaded.authority);
  const hostStarted = performance.now();
  const host = await executeCapacityRoot(
    'linux-host-sample.py',
    [],
    { mode, nodePid: process.pid, ...(browserPid ? { browserPid } : {}) },
    controller.signal,
    loaded.closure,
  );
  health.host({
    startedAtNodeMs: hostStarted,
    completedAtNodeMs: performance.now(),
    sample: host,
  });
  const backendStarted = performance.now();
  const backend = await executeCapacityRoot(
    'backend-cgroup-sample.py',
    [],
    null,
    controller.signal,
    loaded.closure,
  );
  health.backend({
    startedAtNodeMs: backendStarted,
    completedAtNodeMs: performance.now(),
    sample: backend,
  });
  if (histogram.count === 0) throw Error('EVENT_LOOP_UNAVAILABLE');
  health.eventLoop({
    atNodeMs: performance.now(),
    p95Ms: histogram.percentile(95) / 1e6,
  });
  const snapshot = health.snapshot(performance.now());
  if (snapshot.validity !== 'VALID') throw Error('KERNEL_SAMPLE_INVALID');
  await loaded.verify();
  result = {
    result: 'ROOT_KERNEL_SAMPLE_VERIFIED',
    mode,
    executionProfileSha256: profileSha,
    health: snapshot,
    host,
    backend,
    readOnly: true,
    applicationRequests: 0,
    authIdentitiesCreated: 0,
    nativeCapacityProof: false,
  };
} catch {
  result = { result: 'ROOT_KERNEL_SAMPLE_BLOCKED', rawLogsStored: false };
} finally {
  histogram.disable();
  for (const resource of [context, browser, server]) {
    try {
      await resource?.close();
    } catch {
      result = { result: 'ROOT_KERNEL_SAMPLE_BLOCKED', rawLogsStored: false };
    }
  }
}
process.stdout.write(JSON.stringify(result) + '\n');
process.exitCode = result.result === 'ROOT_KERNEL_SAMPLE_VERIFIED' ? 0 : 1;
