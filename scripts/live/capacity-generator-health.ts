import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

export type Measurement = number | 'unavailable';
export interface GeneratorHealth {
  rssBytes: Measurement;
  eventLoopLagP95Ms: Measurement;
  cpuPercent: Measurement;
  limited: boolean;
  limitReason: 'rss' | 'event_loop' | null;
  lagExceededSince: number | null;
}
export const initialGeneratorHealth = (): GeneratorHealth => ({
  rssBytes: 'unavailable',
  eventLoopLagP95Ms: 'unavailable',
  cpuPercent: 'unavailable',
  limited: false,
  limitReason: null,
  lagExceededSince: null,
});
const measurement = (value: Measurement | undefined): Measurement =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 'unavailable';
export const updateGeneratorHealth = (
  previous: GeneratorHealth,
  sample: Partial<
    Pick<GeneratorHealth, 'rssBytes' | 'eventLoopLagP95Ms' | 'cpuPercent'>
  >,
  now: number,
): GeneratorHealth => {
  const rssBytes = measurement(sample.rssBytes);
  const eventLoopLagP95Ms = measurement(sample.eventLoopLagP95Ms);
  const lagExceededSince =
    typeof eventLoopLagP95Ms === 'number' && eventLoopLagP95Ms > 200
      ? (previous.lagExceededSince ?? now)
      : null;
  const rssLimited = typeof rssBytes === 'number' && rssBytes > 2 * 1024 ** 3;
  const lagLimited =
    lagExceededSince !== null && now - lagExceededSince >= 10_000;
  return {
    rssBytes,
    eventLoopLagP95Ms,
    cpuPercent: measurement(sample.cpuPercent),
    lagExceededSince,
    limited: previous.limited || rssLimited || lagLimited,
    limitReason:
      previous.limitReason ??
      (rssLimited ? 'rss' : lagLimited ? 'event_loop' : null),
  };
};

export const monitorGeneratorHealth = (onLimited: () => void) => {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  let health = initialGeneratorHealth();
  let maxRss: Measurement = 'unavailable';
  let maxLag: Measurement = 'unavailable';
  let maxCpu: Measurement = 'unavailable';
  let cpu = process.cpuUsage();
  let sampledAt = performance.now();
  histogram.enable();
  const sample = () => {
    const now = performance.now();
    const usage = process.cpuUsage();
    const cpuPercent =
      (usage.user - cpu.user + usage.system - cpu.system) /
      ((now - sampledAt) * 10);
    const wasLimited = health.limited;
    health = updateGeneratorHealth(
      health,
      {
        rssBytes: process.memoryUsage().rss,
        eventLoopLagP95Ms:
          histogram.count === 0
            ? 'unavailable'
            : histogram.percentile(95) / 1_000_000,
        cpuPercent,
      },
      now,
    );
    cpu = usage;
    sampledAt = now;
    histogram.reset();
    const maximum = (before: Measurement, current: Measurement): Measurement =>
      typeof current === 'number'
        ? Math.max(typeof before === 'number' ? before : 0, current)
        : before;
    maxRss = maximum(maxRss, health.rssBytes);
    maxLag = maximum(maxLag, health.eventLoopLagP95Ms);
    maxCpu = maximum(maxCpu, health.cpuPercent);
    if (health.limited && !wasLimited) onLimited();
  };
  sample();
  const timer = setInterval(sample, 1000);
  timer.unref();
  return {
    snapshot: (): GeneratorHealth => ({
      ...health,
      rssBytes: maxRss,
      eventLoopLagP95Ms: maxLag,
      cpuPercent: maxCpu,
    }),
    stop: () => {
      clearInterval(timer);
      histogram.disable();
    },
  };
};
