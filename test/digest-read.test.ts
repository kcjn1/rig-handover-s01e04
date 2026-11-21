import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('counts log lines per status', () => {
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('sorts rows by job', () => {
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('summarises fixtures/refresh', () => {
    expect(night?.rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the error of a failed job', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
  });

  it('keeps a row with a null owner', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row?.owner).toBeNull();
    expect(row?.lastError).toBeNull();
  });

  it('keeps times exactly as in the log', () => {
    const row = night?.rows.find((r) => r.job === 'lane/sync');
    expect(row?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  const write = (night: string, lines: string[]) =>
    writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the night has no file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    write('2026-01-02', []);
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02',
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('ignores blank lines and counts invalid ones as bad', () => {
    write('2026-01-03', [
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":null}',
      '',
      '   ',
      'not json',
      '[]',
      '"just a string"',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"done","owner":"x"}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok"}',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-01-03T01:00:00+02:00","job":7,"status":"ok","owner":"x"}',
    ]);
    const night = readNight(dir, '2026-01-03');
    expect(night?.badLines).toBe(8);
    expect(night?.rows).toHaveLength(1);
    expect(night?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('takes owner and status from the latest line, error from the latest line with one', () => {
    write('2026-01-04', [
      '{"at":"2026-01-04T01:00:00-05:00","job":"b","status":"fail","owner":"x","error":"boom"}',
      '{"at":"2026-01-04T02:00:00-05:00","job":"b","status":"retry","owner":"y"}',
      '{"at":"2026-01-04T03:00:00-05:00","job":"b","status":"ok","owner":null}',
    ]);
    expect(readNight(dir, '2026-01-04')?.rows).toEqual([
      {
        job: 'b',
        owner: null,
        runs: 3,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'boom',
        firstAt: '2026-01-04T01:00:00-05:00',
        lastAt: '2026-01-04T03:00:00-05:00',
      },
    ]);
  });

  it('sorts jobs by plain code-unit order', () => {
    write('2026-01-05', [
      '{"at":"t1","job":"b","status":"ok","owner":null}',
      '{"at":"t2","job":"B","status":"ok","owner":null}',
      '{"at":"t3","job":"a","status":"ok","owner":null}',
    ]);
    expect(readNight(dir, '2026-01-05')?.rows.map((r) => r.job)).toEqual(['B', 'a', 'b']);
  });
});
