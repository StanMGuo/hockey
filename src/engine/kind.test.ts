import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getScn, SCN } from '../data/scenarios';
import { kindOf } from './kind';
import type { Scenario } from '../types';

const golden = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/kinds.golden.json'), 'utf8'),
) as Record<string, string>;

describe('kindOf', () => {
  it('T-KIND-01 us => own', () => {
    expect(kindOf({ ...getScn('wall'), has: 'us' })).toBe('own');
  });

  it('T-KIND-02 rim threat wins', () => {
    const st = { ...getScn('rim') } as Scenario;
    expect(kindOf(st)).toBe('rim');
  });

  it('T-KIND-03 deep', () => {
    expect(kindOf({ ...getScn('stolen'), threat: undefined })).toBe('deep');
  });

  it('T-KIND-04 carry', () => {
    expect(kindOf(getScn('carry'))).toBe('carry');
  });

  it('T-KIND-05 out', () => {
    expect(kindOf(getScn('out'))).toBe('out');
  });

  it('T-KIND-06 all BASE+mirror match golden', () => {
    for (const id of Object.keys(SCN)) {
      expect(kindOf(getScn(id))).toBe(golden[id]);
    }
  });
});
