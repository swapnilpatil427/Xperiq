/**
 * Scheduler runner — ticks on a fixed cadence, runs any due job, records metrics, and stamps
 * a heartbeat every tick so a dead/forgotten scheduler is detected by `SchedulerHeartbeatStale`.
 * Per-job locks prevent overlapping runs; a slow job never blocks the others.
 */
import { JOBS, type Job } from './registry';
import {
  schedulerJobRuns, schedulerJobDuration, schedulerJobLastSuccess, touchHeartbeat,
} from '../lib/metrics';
import { ensureLeadership } from './leader';
import logger from '../lib/logger';

export const COMPONENT = 'scheduler';
const TICK_SEC = (() => { const n = Number(process.env.SCHEDULER_TICK_SEC); return Number.isFinite(n) && n > 0 ? n : 30; })();

const lastRun: Record<string, number> = {};
const inFlight: Record<string, boolean> = {};
let stopped = false;

/** Pure: which enabled jobs are due at `now` given their last-run timestamps. */
export function dueJobs(jobs: Job[], last: Record<string, number>, now: number): Job[] {
  return jobs.filter((j) => j.enabled && now - (last[j.name] ?? 0) >= j.intervalSec * 1000);
}

/** Run one job with metrics + error isolation. Returns the outcome for testability. */
export async function runJob(job: Job): Promise<'success' | 'failure' | 'skipped'> {
  if (inFlight[job.name]) {
    logger.warn({ job: job.name }, 'scheduler: previous run still in flight — skipping');
    return 'skipped';
  }
  inFlight[job.name] = true;
  const endTimer = schedulerJobDuration.startTimer({ job: job.name });
  try {
    const res = await job.handler();
    endTimer();
    schedulerJobRuns.inc({ job: job.name, result: 'success' });
    schedulerJobLastSuccess.set({ job: job.name }, Date.now() / 1000);
    logger.info({ job: job.name, ...(res ?? {}) }, 'scheduler: job ok');
    return 'success';
  } catch (err) {
    endTimer();
    schedulerJobRuns.inc({ job: job.name, result: 'failure' });
    logger.error(
      { job: job.name, err: err instanceof Error ? err.message : String(err) },
      'scheduler: job failed',
    );
    return 'failure';
  } finally {
    inFlight[job.name] = false;
    lastRun[job.name] = Date.now();
  }
}

/**
 * One scheduler tick: stamp heartbeat (always, so every replica is observable), then — only
 * if this replica is the leader — fire any due jobs. Standbys stay warm and take over on failover.
 */
export async function tick(now = Date.now()): Promise<void> {
  touchHeartbeat(COMPONENT);
  const lead = await ensureLeadership();
  if (!lead) return;
  for (const job of dueJobs(JOBS, lastRun, now)) {
    void runJob(job);
  }
}

export function start(): NodeJS.Timeout {
  logger.info(
    { tick_sec: TICK_SEC, jobs: JOBS.filter((j) => j.enabled).map((j) => j.name) },
    'scheduler: runner started',
  );
  void tick().catch((err: unknown) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'scheduler: tick failed');
  });
  return setInterval(() => {
    if (!stopped) {
      void tick().catch((err: unknown) => {
        logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'scheduler: tick failed');
      });
    }
  }, TICK_SEC * 1000);
}

export function stop(): void { stopped = true; }
