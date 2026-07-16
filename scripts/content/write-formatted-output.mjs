import { writeFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';

export async function writeFormattedOutput({ filePath, source }) {
  const configuration = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(source, {
    ...configuration,
    filepath: filePath,
  });
  await writeFile(filePath, formatted, 'utf8');
}
