import { isProxy } from 'node:util/types';
import { z } from 'zod';
const keys = [
  'code',
  'error_code',
  'msg',
  'error',
  'message',
  'error_description',
  'status',
  'status_code',
  'request_id',
  'error_id',
] as const;
const kind = z.enum([
  'UNOBSERVED',
  'NULL',
  'OBJECT',
  'ARRAY',
  'STRING',
  'NUMBER',
  'BOOLEAN',
  'OTHER',
]);
const field = z.strictObject({
  presence: z.enum(['UNOBSERVED', 'TOKEN_SEEN', 'PRESENT', 'ABSENT']),
  type: kind,
});
const reason = z.enum([
  'UNOBSERVED',
  'ACCEPTED',
  'KEY_NONCANONICAL',
  'KEY_DUPLICATE',
  'KEY_UNKNOWN',
  'JSON_INVALID',
  'TOP_SHAPE',
  'ERROR_CODE',
  'CODE_FIELD',
  'MSG_FIELD',
  'OTHER',
]);
export const onboardingBodyDiagnosticsSchema = z.strictObject({
  collection: z.enum(['UNOBSERVED', 'OBSERVED', 'UNAVAILABLE']),
  parserStage: z.enum(['UNOBSERVED', 'LEXER', 'JSON', 'SCHEMA', 'COMPLETE']),
  parserReason: reason,
  topLevelKind: kind,
  unrecognizedKeyCount: z.number().int().min(0).max(1024).nullable(),
  fields: z.strictObject({
    code: field,
    error_code: field,
    msg: field,
    error: field,
    message: field,
    error_description: field,
    status: field,
    status_code: field,
    request_id: field,
    error_id: field,
  }),
  codeValue: z.enum(['UNOBSERVED', 'ABSENT', 'MATCH', 'OTHER']),
  errorCodeValue: z.enum(['UNOBSERVED', 'ABSENT', 'MATCH', 'OTHER']),
});
type Value = z.infer<typeof onboardingBodyDiagnosticsSchema>;
const empty = (): Value => ({
  collection: 'UNOBSERVED',
  parserStage: 'UNOBSERVED',
  parserReason: 'UNOBSERVED',
  topLevelKind: 'UNOBSERVED',
  unrecognizedKeyCount: null,
  fields: Object.fromEntries(
    keys.map((key) => [key, { presence: 'UNOBSERVED', type: 'UNOBSERVED' }]),
  ) as Value['fields'],
  codeValue: 'UNOBSERVED',
  errorCodeValue: 'UNOBSERVED',
});
const own = (value: unknown, key: PropertyKey): unknown => {
  if (!value || typeof value !== 'object' || isProxy(value)) throw Error();
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor && !('value' in descriptor)) throw Error();
  return descriptor?.value;
};
const valueKind = (value: unknown): Value['topLevelKind'] => {
  if (value === null) return 'NULL';
  if (typeof value === 'object') {
    if (isProxy(value)) throw Error();
    return Array.isArray(value) ? 'ARRAY' : 'OBJECT';
  }
  if (typeof value === 'string') return 'STRING';
  if (typeof value === 'number') return 'NUMBER';
  if (typeof value === 'boolean') return 'BOOLEAN';
  return 'OTHER';
};
export const createOnboardingBodyDiagnostics = () => {
  const data = empty();
  const observe = (action: () => void) => {
    try {
      action();
    } catch {
      data.collection = 'UNAVAILABLE';
    }
  };
  const reject = (next: z.infer<typeof reason>) => {
    if (!reason.options.includes(next)) throw Error();
    if (data.parserReason === 'UNOBSERVED') data.parserReason = next;
  };
  return {
    stage(next: 'LEXER' | 'JSON' | 'SCHEMA') {
      observe(() => {
        data.collection =
          data.collection === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'OBSERVED';
        data.parserStage = next;
        if (next === 'LEXER') data.unrecognizedKeyCount = 0;
      });
    },
    key(token: string) {
      observe(() => {
        const key = keys.find((key) => token === `"${key}"`);
        if (key) data.fields[key].presence = 'TOKEN_SEEN';
        else
          data.unrecognizedKeyCount = Math.min(
            1024,
            (data.unrecognizedKeyCount ?? 0) + 1,
          );
      });
    },
    rejected(next: z.infer<typeof reason>) {
      observe(() => {
        reject(next);
      });
    },
    schema(value: unknown, result: unknown) {
      observe(() => {
        data.topLevelKind = valueKind(value);
        if (data.topLevelKind === 'OBJECT') {
          const prototype: unknown = Object.getPrototypeOf(value);
          if (prototype !== Object.prototype && prototype !== null)
            throw Error();
          data.unrecognizedKeyCount = Object.keys(value as object).filter(
            (key) => !keys.some((known) => known === key),
          ).length;
          for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (descriptor && !('value' in descriptor)) throw Error();
            data.fields[key] = descriptor
              ? { presence: 'PRESENT', type: valueKind(descriptor.value) }
              : { presence: 'ABSENT', type: 'UNOBSERVED' };
          }
          data.codeValue =
            data.fields.code.presence === 'ABSENT'
              ? 'ABSENT'
              : own(value, 'code') === 403
                ? 'MATCH'
                : 'OTHER';
          data.errorCodeValue =
            data.fields.error_code.presence === 'ABSENT'
              ? 'ABSENT'
              : own(value, 'error_code') === 'session_not_found'
                ? 'MATCH'
                : 'OTHER';
        }
        if (own(result, 'success') === false) {
          if (data.topLevelKind !== 'OBJECT') {
            reject('TOP_SHAPE');
            return;
          }
          const issues = own(own(result, 'error'), 'issues');
          if (!Array.isArray(issues) || isProxy(issues)) {
            reject('OTHER');
            return;
          }
          const first: unknown = own(issues, '0');
          const path = own(first, 'path');
          const name =
            Array.isArray(path) && !isProxy(path) ? own(path, '0') : undefined;
          reject(
            name === 'error_code'
              ? 'ERROR_CODE'
              : name === 'code'
                ? 'CODE_FIELD'
                : name === 'msg'
                  ? 'MSG_FIELD'
                  : own(first, 'code') === 'unrecognized_keys'
                    ? 'KEY_UNKNOWN'
                    : 'OTHER',
          );
        }
      });
    },
    accepted() {
      observe(() => {
        data.parserStage = 'COMPLETE';
        reject('ACCEPTED');
      });
    },
    caught() {
      observe(() => {
        reject(data.parserStage === 'JSON' ? 'JSON_INVALID' : 'OTHER');
      });
    },
    snapshot(): Value {
      try {
        return onboardingBodyDiagnosticsSchema.parse({
          ...data,
          fields: Object.fromEntries(
            keys.map((key) => [key, { ...data.fields[key] }]),
          ),
        });
      } catch {
        data.collection = 'UNAVAILABLE';
        const fallback = empty();
        fallback.collection = 'UNAVAILABLE';
        if (reason.options.includes(data.parserReason))
          fallback.parserReason = data.parserReason;
        return fallback;
      }
    },
  };
};
