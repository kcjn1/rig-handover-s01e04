// Plan morning-digest § 1. The contract every part of § 2 builds against.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log.
export type DigestRow = {
  job: string;
  // `null` when the log says so. Views render it as `—`, never drop the row.
  owner: string | null;
  // Lines for this job, whatever their status.
  runs: number;
  // Lines for this job with status `retry`.
  retries: number;
  // Status of the job's latest line.
  lastStatus: RunStatus;
  // Error of the job's latest line that carried one, or `null` if none did.
  lastError: string | null;
  // `at` of the job's first and latest line, exactly as in the log (offset kept, never UTC).
  firstAt: string;
  lastAt: string;
};

// Log lines per status, over the whole night (bad lines not included).
export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string;
  // Sorted by job. The page and the JSON both use this order (ADR 0001).
  rows: DigestRow[];
  // Non-empty lines that did not parse as a valid run line. Counted, never thrown.
  badLines: number;
  counts: StatusCounts;
};

// Reads `<runsDir>/<night>.jsonl`. Returns `null` when the night has no file;
// an empty file gives a Night with no rows. Implemented in `src/digest/read.ts`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
