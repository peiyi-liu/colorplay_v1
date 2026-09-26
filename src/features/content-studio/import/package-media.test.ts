import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { ContentImportParseError } from './contracts';
import { inspectContentImportMedia } from './package-media';

const zipFile = (entries: Record<string, Uint8Array>): File => {
  const bytes = zipSync(entries);
  const exact = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const file = new File([exact], 'chapter-3.zip', { type: 'application/zip' });
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(exact),
  });
  return file;
};

describe('inspectContentImportMedia', () => {
  it('extracts declared ZIP media with its trusted semantic role', async () => {
    const file = zipFile({
      'csv/Media.csv': new Uint8Array(
        strToU8(
          'owner_code,path,alt_text,semantic_role,sort_order\nRC3101,media/sample.png,色彩圖,color_critical,0',
        ),
      ),
      'csv/RC.csv': new Uint8Array(
        strToU8(
          'stable_code,subtopic_code,title,content\nRC3101,sheet-3-1-all,範例,內容',
        ),
      ),
      'media/sample.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });

    await expect(inspectContentImportMedia(file)).resolves.toMatchObject([
      {
        file: { name: 'sample.png', type: 'image/png' },
        path: 'media/sample.png',
        semanticRole: 'color_critical',
      },
    ]);
  });

  it('fails closed when a ZIP image is not declared in the Media sheet', async () => {
    const file = zipFile({
      'csv/RC.csv': new Uint8Array(
        strToU8(
          'stable_code,subtopic_code,title,content\nRC3101,sheet-3-1-all,範例,內容',
        ),
      ),
      'media/orphan.webp': new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    });

    await expect(inspectContentImportMedia(file)).rejects.toBeInstanceOf(
      ContentImportParseError,
    );
  });

  it('does not invent media for a standalone XLSX package', async () => {
    const file = new File([new Uint8Array([1])], 'content.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await expect(inspectContentImportMedia(file)).resolves.toEqual([]);
  });
});
