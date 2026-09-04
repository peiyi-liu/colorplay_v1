import { describe, expect, it } from 'vitest';

import { teacherAvatarQueryKey } from './use-teacher-avatar';

describe('teacherAvatarQueryKey', () => {
  it('scopes private avatar URLs to the authenticated actor', () => {
    expect(teacherAvatarQueryKey('teacher-id')).toEqual([
      'teacher',
      'teacher-id',
      'avatar',
    ]);
  });
});
