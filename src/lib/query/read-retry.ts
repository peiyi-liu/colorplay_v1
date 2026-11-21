export const calculateReadQueryRetryDelay = (
  attemptIndex: number,
  random: () => number = Math.random,
): number => {
  const exponentialDelay = Math.min(500 * 2 ** attemptIndex, 4_000);
  return Math.round(exponentialDelay * (0.5 + random() * 0.5));
};

export const readQueryRetryDelay = (attemptIndex: number): number =>
  calculateReadQueryRetryDelay(attemptIndex);
