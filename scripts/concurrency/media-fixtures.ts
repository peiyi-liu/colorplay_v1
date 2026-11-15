import { deflateSync } from 'node:zlib';
import { zipSync, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';
import { fail, type FunctionalScope } from './config';
import type { OwnedMediaSource } from './media-interception';
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, bytes: Buffer) => {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([size, name, bytes, crc]);
};
export const deterministicPng = (seed: number) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64, 0);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 6;
  const pixels = Buffer.alloc(64 * (64 * 4 + 1));
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const at = y * 257 + 1 + x * 4;
      pixels[at] = (seed * 31 + x) % 256;
      pixels[at + 1] = (seed * 47 + y) % 256;
      pixels[at + 2] = (seed * 61) % 256;
      pixels[at + 3] = 255;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};
export const buildMediaFixtures = (
  scope: FunctionalScope,
  subtopicCode: string,
) => {
  if (!/^[a-zA-Z0-9_.-]{1,120}$/u.test(subtopicCode))
    return fail('FUNCTIONAL_SCOPE_INVALID');
  const images = (['single', 'zip1', 'zip2', 'cancel'] as const).map(
    (slot, index) => {
      const buffer = deterministicPng(index + 1);
      return {
        slot,
        name: `${scope.runId}-${slot}.png`,
        mimeType: 'image/png',
        buffer,
      };
    },
  );
  const sources: OwnedMediaSource[] = images.map((image) => ({
    slot: image.slot,
    filename: image.name,
    bytes: image.buffer.length,
    sha256: createHash('sha256').update(image.buffer).digest('hex'),
  }));
  const codes = [`${scope.runId}-rc1`, `${scope.runId}-rc2`];
  const rc = [
    'stable_code,subtopic_code,group_label,title,content,requires_recompletion,sort_order',
    ...codes.map(
      (code, index) =>
        `${code},${subtopicCode},驗證,Local媒體${String(index + 1)},僅本次草稿不得發布,false,999`,
    ),
  ].join('\n');
  const zipImages = images.filter(
    (image) => image.slot === 'zip1' || image.slot === 'zip2',
  );
  const media = [
    'owner_code,path,alt_text,semantic_role,sort_order',
    ...zipImages.map(
      (image, index) =>
        `${codes[index] ?? fail('FUNCTIONAL_OPERATION_FAILED')},media/${image.name},Local合成圖片${String(index + 1)},standard,0`,
    ),
  ].join('\n');
  const entries: Record<string, Uint8Array> = {
    'csv/RC.csv': strToU8(rc),
    'csv/Media.csv': strToU8(media),
  };
  for (const image of zipImages)
    entries[`media/${image.name}`] = new Uint8Array(image.buffer);
  const cancelImage = images.find((image) => image.slot === 'cancel');
  if (!cancelImage) return fail('FUNCTIONAL_OPERATION_FAILED');
  const cancelEntries = {
    'csv/RC.csv': strToU8(
      `stable_code,subtopic_code,group_label,title,content,requires_recompletion,sort_order\n${scope.runId}-cancel-rc,${subtopicCode},驗證,Local取消,僅本次未完成套件,false,999`,
    ),
    'csv/Media.csv': strToU8(
      `owner_code,path,alt_text,semantic_role,sort_order\n${scope.runId}-cancel-rc,media/${cancelImage.name},Local取消圖片,standard,0`,
    ),
    [`media/${cancelImage.name}`]: new Uint8Array(cancelImage.buffer),
  };
  return {
    images,
    sources,
    stableCodes: codes,
    cancelZip: {
      name: `${scope.runId}-cancel.zip`,
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync(
          Object.fromEntries(
            Object.entries(cancelEntries).map(([name, value]) => [
              name,
              new Uint8Array(value),
            ]),
          ),
        ),
      ),
    },
    zip: {
      name: `${scope.runId}-media.zip`,
      mimeType: 'application/zip',
      buffer: Buffer.from(
        zipSync(
          Object.fromEntries(
            Object.entries(entries).map(([name, value]) => [
              name,
              new Uint8Array(value),
            ]),
          ),
        ),
      ),
    },
  };
};
