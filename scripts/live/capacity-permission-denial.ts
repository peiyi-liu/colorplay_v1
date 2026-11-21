// Match only server refusal formats confirmed by the harness. Never retain topics.
export const isPermissionDenialMessage = (message: unknown): boolean =>
  typeof message === 'string' &&
  (/^You do not have permissions to read from this Topic\b/u.test(message) ||
    /^Unauthorized: You do not have permissions to read from this Channel topic: \S[^\r\n]*$/u.test(
      message,
    ) ||
    message === 'Unauthorized' ||
    message === 'Forbidden');

export const isExplicitPermissionDenial = (error: unknown): boolean => {
  try {
    if (!(error instanceof Error)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(error, 'message');
    return Boolean(
      descriptor &&
      'value' in descriptor &&
      isPermissionDenialMessage(descriptor.value),
    );
  } catch {
    return false;
  }
};
