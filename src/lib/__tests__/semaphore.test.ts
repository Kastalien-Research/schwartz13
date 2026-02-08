import { describe, it, expect } from 'vitest';
import { Semaphore } from '../semaphore.js';

describe('Semaphore', () => {
  it('allows up to N concurrent permits', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    // Third acquire should block
    let resolved = false;
    const p = sem.acquire().then(() => { resolved = true; });
    // Give microtask queue a chance
    await Promise.resolve();
    expect(resolved).toBe(false);
    sem.release();
    await p;
    expect(resolved).toBe(true);
  });

  it('run() releases on success', async () => {
    const sem = new Semaphore(1);
    const result = await sem.run(async () => 42);
    expect(result).toBe(42);
    // Permit should be available again
    await sem.acquire();
    sem.release();
  });

  it('run() releases on error', async () => {
    const sem = new Semaphore(1);
    await expect(sem.run(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    // Permit should be available again
    await sem.acquire();
    sem.release();
  });

  it('limits concurrent execution', async () => {
    const sem = new Semaphore(3);
    let concurrent = 0;
    let maxConcurrent = 0;

    const task = () => sem.run(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
    });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxConcurrent).toBe(3);
  });
});
