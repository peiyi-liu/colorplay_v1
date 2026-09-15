const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function remediationReturnState(state: unknown) {
  if (
    typeof state !== 'object' ||
    state === null ||
    !('remediationReturnSubtopicId' in state)
  )
    return {};
  const id = state.remediationReturnSubtopicId;
  return typeof id === 'string' && uuid.test(id)
    ? { remediationReturnSubtopicId: id }
    : {};
}

export const mistakeSubtopicAnchor = (id: string) => `mistake-subtopic-${id}`;

export function remediationReturnTarget(state: unknown) {
  const id = remediationReturnState(state).remediationReturnSubtopicId;
  return `/app/mistakes${id ? `#${mistakeSubtopicAnchor(id)}` : ''}`;
}

export function returnedMistakeSubtopic(hash: string) {
  const id = hash.slice('#mistake-subtopic-'.length);
  return hash.startsWith('#mistake-subtopic-') && uuid.test(id)
    ? id
    : undefined;
}
