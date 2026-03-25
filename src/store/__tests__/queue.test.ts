import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getDb, closeDb,
  upsertCompany, recordLensHit, updateScore, saveVerdict,
  getCompany, listCandidates, normalizeDomain,
} from '../db.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let testDbPath: string;

beforeEach(() => {
  testDbPath = path.join(os.tmpdir(), `queue-test-${Date.now()}.db`);
  closeDb();
  process.env.WEBSETS_DB_PATH = testDbPath;
  getDb(testDbPath);
});

afterEach(() => {
  closeDb();
  try { fs.unlinkSync(testDbPath); } catch {}
  delete process.env.WEBSETS_DB_PATH;
});

describe('normalizeDomain', () => {
  it('strips protocol and www', () => {
    expect(normalizeDomain('https://www.vercel.com')).toBe('vercel.com');
  });

  it('strips path and query', () => {
    expect(normalizeDomain('https://example.com/about?ref=1')).toBe('example.com');
  });

  it('lowercases', () => {
    expect(normalizeDomain('HTTPS://Vercel.COM')).toBe('vercel.com');
  });

  it('handles bare domain', () => {
    expect(normalizeDomain('acme.io')).toBe('acme.io');
  });

  it('strips port', () => {
    expect(normalizeDomain('http://localhost:3000/path')).toBe('localhost');
  });
});

describe('upsertCompany', () => {
  it('inserts a new company', () => {
    upsertCompany('vercel.com', 'Vercel');
    const result = getCompany('vercel.com');
    expect(result).not.toBeNull();
    expect(result!.company.canonical_name).toBe('Vercel');
    expect(result!.company.domain).toBe('vercel.com');
  });

  it('updates on conflict', () => {
    upsertCompany('vercel.com', 'Vercel');
    upsertCompany('vercel.com', 'Vercel Inc', 'dev-tools');
    const result = getCompany('vercel.com');
    expect(result!.company.canonical_name).toBe('Vercel Inc');
    expect(result!.company.sector).toBe('dev-tools');
  });

  it('preserves existing sector when not provided', () => {
    upsertCompany('vercel.com', 'Vercel', 'dev-tools');
    upsertCompany('vercel.com', 'Vercel');
    const result = getCompany('vercel.com');
    expect(result!.company.sector).toBe('dev-tools');
  });
});

describe('recordLensHit', () => {
  it('records a lens hit', () => {
    upsertCompany('vercel.com', 'Vercel');
    recordLensHit('vercel.com', 'agent_buildout', {
      websetId: 'ws_1',
      evidenceUrl: 'https://vercel.com/blog/ai',
    });
    const result = getCompany('vercel.com');
    expect(result!.lensHits).toHaveLength(1);
    expect(result!.lensHits[0].lens_id).toBe('agent_buildout');
    expect(result!.lensHits[0].evidence_url).toBe('https://vercel.com/blog/ai');
  });

  it('updates on duplicate lens', () => {
    upsertCompany('vercel.com', 'Vercel');
    recordLensHit('vercel.com', 'agent_buildout', { strength: 'low' });
    recordLensHit('vercel.com', 'agent_buildout', { strength: 'high' });
    const result = getCompany('vercel.com');
    expect(result!.lensHits).toHaveLength(1);
    expect(result!.lensHits[0].strength).toBe('high');
  });

  it('allows multiple lenses per company', () => {
    upsertCompany('vercel.com', 'Vercel');
    recordLensHit('vercel.com', 'agent_buildout');
    recordLensHit('vercel.com', 'control_pain');
    const result = getCompany('vercel.com');
    expect(result!.lensHits).toHaveLength(2);
  });
});

describe('updateScore', () => {
  it('persists score and verdict', () => {
    upsertCompany('vercel.com', 'Vercel');
    updateScore('vercel.com', 11, { control_pain: 5, multi_lens: 4, recent_trigger: 3 }, 'claim_and_research');
    const result = getCompany('vercel.com');
    expect(result!.score).not.toBeNull();
    expect(result!.score!.score).toBe(11);
    expect(result!.score!.verdict).toBe('claim_and_research');
  });

  it('updates on subsequent calls', () => {
    upsertCompany('vercel.com', 'Vercel');
    updateScore('vercel.com', 5, { control_pain: 5 }, 'monitor');
    updateScore('vercel.com', 9, { control_pain: 5, multi_lens: 4 }, 'queue_for_review');
    const result = getCompany('vercel.com');
    expect(result!.score!.score).toBe(9);
    expect(result!.score!.verdict).toBe('queue_for_review');
  });
});

describe('getCompany', () => {
  it('returns null for unknown domain', () => {
    expect(getCompany('unknown.com')).toBeNull();
  });

  it('returns full record with all associations', () => {
    upsertCompany('vercel.com', 'Vercel');
    recordLensHit('vercel.com', 'agent_buildout');
    updateScore('vercel.com', 5, { control_pain: 5 }, 'monitor');
    saveVerdict('vercel.com', 'monitor', 0.8, { reason: 'test' });

    const result = getCompany('vercel.com');
    expect(result!.company).toBeTruthy();
    expect(result!.lensHits).toHaveLength(1);
    expect(result!.score).toBeTruthy();
    expect(result!.latestVerdict).toBeTruthy();
    expect(result!.latestVerdict!.verdict).toBe('monitor');
  });
});

describe('listCandidates', () => {
  it('returns companies ordered by score DESC', () => {
    upsertCompany('a.com', 'A');
    upsertCompany('b.com', 'B');
    recordLensHit('a.com', 'agent_buildout');
    recordLensHit('b.com', 'control_pain');
    updateScore('a.com', 5, {}, 'monitor');
    updateScore('b.com', 10, {}, 'claim_and_research');

    const results = listCandidates();
    expect(results).toHaveLength(2);
    expect(results[0].company.domain).toBe('b.com');
    expect(results[0].score).toBe(10);
  });

  it('filters by minScore', () => {
    upsertCompany('a.com', 'A');
    upsertCompany('b.com', 'B');
    updateScore('a.com', 5, {}, 'monitor');
    updateScore('b.com', 10, {}, 'claim_and_research');

    const results = listCandidates(7);
    expect(results).toHaveLength(1);
    expect(results[0].company.domain).toBe('b.com');
  });

  it('filters by verdict', () => {
    upsertCompany('a.com', 'A');
    upsertCompany('b.com', 'B');
    updateScore('a.com', 5, {}, 'monitor');
    updateScore('b.com', 10, {}, 'claim_and_research');

    const results = listCandidates(undefined, 'monitor');
    expect(results).toHaveLength(1);
    expect(results[0].company.domain).toBe('a.com');
  });

  it('includes lens hits', () => {
    upsertCompany('a.com', 'A');
    recordLensHit('a.com', 'agent_buildout');
    recordLensHit('a.com', 'control_pain');
    updateScore('a.com', 9, {}, 'queue_for_review');

    const results = listCandidates();
    expect(results[0].lensHits).toEqual(['agent_buildout', 'control_pain']);
  });
});
