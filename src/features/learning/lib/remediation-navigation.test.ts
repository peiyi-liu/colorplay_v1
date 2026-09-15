import { describe, expect, it } from 'vitest';
import {
  remediationReturnState,
  remediationReturnTarget,
  returnedMistakeSubtopic,
} from './remediation-navigation';

describe('remediation navigation allowlist', () => {
  it.each([
    null,
    undefined,
    {},
    'https://example.com',
    { remediationReturnSubtopicId: '/app/admin' },
    { remediationReturnSubtopicId: '../escape' },
    { remediationReturnSubtopicId: 1 },
  ])('ignores invalid context %#', (state) => {
    expect(remediationReturnState(state)).toEqual({});
    expect(remediationReturnTarget(state)).toBe('/app/mistakes');
  });
  it('keeps only a valid subtopic id, not arbitrary route or credential fields', () => {
    const id = 'f929cde5-c294-46ce-5faf-c866b3cb9583';
    expect(
      remediationReturnState({
        remediationReturnSubtopicId: id,
        next: '/admin',
        password: 'synthetic',
      }),
    ).toEqual({ remediationReturnSubtopicId: id });
    expect(returnedMistakeSubtopic(`#mistake-subtopic-${id}`)).toBe(id);
    expect(returnedMistakeSubtopic(`#other-${id}`)).toBeUndefined();
  });
});
