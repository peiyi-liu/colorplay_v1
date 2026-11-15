import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, functionalFailureCode } from './config';
import { loadFunctionalRuntime } from './functional-runtime';
import { createActualFunctionalPorts } from './functional-journeys';
import { runFunctional } from './functional-runner';
export const functionalMain = async (input: readonly string[]) => {
  const args = input[0] === '--' ? input.slice(1) : input;
  try {
    if (
      args.length !== 4 ||
      args[0] !== '--request' ||
      args[2] !== '--approval-sha256' ||
      !args[1] ||
      !args[3]
    )
      return fail('FUNCTIONAL_SCOPE_INVALID');
    const runtime = await loadFunctionalRuntime(args[1], args[3]);
    const receipt = await runFunctional(createActualFunctionalPorts(runtime));
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return receipt.result === 'PASS' ? 0 : 1;
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({ result: 'FAIL', failureStage: 'preflight', code: functionalFailureCode(error) })}\n`,
    );
    return 1;
  }
};
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = await functionalMain(process.argv.slice(2));
