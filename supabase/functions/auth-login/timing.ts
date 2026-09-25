export type AuthLoginTiming = Readonly<{
  authUserMs: number;
  passwordGrantMs: number;
  profileMs: number;
  totalMs: number;
}>;

const safeDuration = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 10) / 10);
};

export const buildAuthTimingHeader = (timing: AuthLoginTiming): string =>
  [
    `profile;dur=${String(safeDuration(timing.profileMs))}`,
    `auth-user;dur=${String(safeDuration(timing.authUserMs))}`,
    `password-grant;dur=${String(safeDuration(timing.passwordGrantMs))}`,
    `total;dur=${String(safeDuration(timing.totalMs))}`,
  ].join(', ');
