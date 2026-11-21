import { pathToFileURL } from 'node:url';
import { admitCapacityRun, loadCapacityRuntime } from './capacity-runtime';
import { runOneCapacityLeg } from './capacity-runner';
export const mainCapacity = async (args: readonly string[]) => {
  const controller = new AbortController(),
    abort = () => {
      controller.abort();
    };
  process.once('SIGTERM', abort);
  process.once('SIGINT', abort);
  try {
    if (
      (args.length !== 2 && args.length !== 4) ||
      args[0] !== '--request' ||
      !args[1] ||
      (args.length === 4 &&
        (args[2] !== '--approve' || !/^[a-f0-9]{64}$/u.test(args[3] ?? '')))
    )
      throw new Error('CAPACITY_EVIDENCE_INVALID');
    const runtime = await loadCapacityRuntime(
      args[1],
      controller.signal,
      undefined,
      args[3],
    );
    await admitCapacityRun(runtime, controller.signal);
    const receipt = await runOneCapacityLeg(runtime, controller.signal, {
      startedAtMs: 0,
    });
    process.stdout.write(JSON.stringify(receipt) + '\n');
    return receipt.result === 'PASS' ? 0 : 1;
  } catch {
    process.stdout.write(
      JSON.stringify({ result: 'BLOCKED', code: 'CAPACITY_EVIDENCE_INVALID' }) +
        '\n',
    );
    return 1;
  } finally {
    process.removeListener('SIGTERM', abort);
    process.removeListener('SIGINT', abort);
  }
};
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await mainCapacity(process.argv.slice(2));
