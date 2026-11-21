import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });

const normal = [
  line('2026-10-28T01:00:00+01:00', 'zeta-sync', 'ok', 'ola'),
  line('2026-10-28T01:05:00+01:00', 'alpha-backup', 'ok', 'ola'),
  line('2026-10-28T01:10:00+01:00', 'mid-report', 'fail', 'kuba', 'disk full'),
  line('2026-10-28T02:00:00+01:00', 'zeta-sync', 'ok', 'ola'),
].join('\n');

const retried = [
  line('2026-10-28T01:00:00+01:00', 'flaky', 'retry', 'ola', 'timeout'),
  line('2026-10-28T01:10:00+01:00', 'flaky', 'retry', 'ola', 'timeout'),
  line('2026-10-28T01:20:00+01:00', 'flaky', 'retry', 'ola', 'timeout'),
  line('2026-10-28T01:30:00+01:00', 'flaky', 'ok', 'ola'),
  line('2026-10-28T01:40:00+01:00', 'orphan', 'ok', null),
  line('2026-10-28T01:50:00+01:00', 'calm', 'ok', 'ola'),
].join('\n');

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.LANE_MARKER = 'TEST-MARKER';
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(dir, '2026-10-28.jsonl'), `${normal}\n`);
  writeFileSync(join(dir, '2026-10-29.jsonl'), '');
  writeFileSync(join(dir, '2026-10-30.jsonl'), `${normal}\nthis is not json\n`);
  writeFileSync(join(dir, '2026-10-31.jsonl'), `${retried}\n`);
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const page = async (night: string) => {
  const res = await app.request(`/digest/${night}`);
  return { res, html: await res.text() };
};
const json = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};

describe('GET /digest/:night', () => {
  it('lists the jobs of a normal night sorted by job, under the lane banner', async () => {
    const { res, html } = await page('2026-10-28');
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const a = html.indexOf('alpha-backup');
    const m = html.indexOf('mid-report');
    const z = html.indexOf('zeta-sync');
    expect(a).toBeGreaterThan(-1);
    expect(m).toBeGreaterThan(a);
    expect(z).toBeGreaterThan(m);
  });

  it('404 for a night with no file', async () => {
    const { res, html } = await page('2026-01-01');
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for that night');
  });

  it('404 for an invalid night', async () => {
    const { res } = await page('nope');
    expect(res.status).toBe(404);
  });

  it('says nothing ran on an empty night', async () => {
    const { res, html } = await page('2026-10-29');
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders with a bad line and says so', async () => {
    const { res, html } = await page('2026-10-30');
    expect(res.status).toBe(200);
    expect(html).toContain('alpha-backup');
    expect(html).toContain('1 line could not be read');
  });

  it('marks 3+ retries and fail rows as warn, and renders a null owner as a dash', async () => {
    const fail = (await page('2026-10-28')).html;
    expect(fail).toMatch(/<tr class="warn"><td>mid-report<\/td>/);
    expect(fail).not.toMatch(/<tr class="warn"><td>alpha-backup<\/td>/);

    const { html } = await page('2026-10-31');
    expect(html).toMatch(/<tr class="warn"><td>flaky<\/td>/);
    expect(html).not.toMatch(/<tr class="warn"><td>calm<\/td>/);
    expect(html).toContain('<td>orphan</td><td>—</td>');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the rows of a normal night in the same order as the page', async () => {
    const { res, body } = await json('2026-10-28');
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-28');
    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha-backup', 'mid-report', 'zeta-sync']);
    expect(body.counts).toEqual({ ok: 3, retry: 0, fail: 1 });
    expect(body.badLines).toBe(0);

    const { html } = await page('2026-10-28');
    const positions = jobs.map((j) => html.indexOf(j));
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(positions.every((p) => p > -1)).toBe(true);
  });

  it('404 with an error body for a night with no file', async () => {
    const { res, body } = await json('2026-01-01');
    expect(res.status).toBe(404);
    expect(body).toMatchObject({ night: '2026-01-01' });
  });

  it('404 for an invalid night', async () => {
    const { res } = await json('nope');
    expect(res.status).toBe(404);
  });

  it('gives no rows and zero counts for an empty night', async () => {
    const { res, body } = await json('2026-10-29');
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line and still answers 200', async () => {
    const { res, body } = await json('2026-10-30');
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(3);
  });

  it('keeps a null owner as null', async () => {
    const { body } = await json('2026-10-31');
    expect(body.rows.find((r) => r.job === 'orphan')?.owner).toBeNull();
    expect(body.rows.find((r) => r.job === 'flaky')?.retries).toBe(3);
  });
});
