import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Bill, Execution } from '@/server/db/models';
import { InvalidStateError } from '@/server/domain/stateMachine';
import { createQueue, createWorker, jobIds } from '@/server/queue';
import { createExecution } from '@/server/services/executionCreate';
import {
  bootDb,
  isolatedPrefix,
  shutdownDb,
  watchingBillInput,
} from '@/server/test/harness';

beforeAll(async () => {
  await bootDb();
});

afterAll(async () => {
  await shutdownDb();
});

describe('backend foundations', () => {
  it('commits the execution-create transaction and runs a BullMQ job', async () => {
    const bill = await Bill.create(watchingBillInput('exec'));
    const created = await createExecution({
      billId: String(bill._id),
      expectedVersion: bill.version,
      mode: 'TARGET',
      attempt: 1,
      requestId: `tr:${bill._id}:1`,
      event: {
        ts: new Date('2026-10-04T12:00:00.000Z'),
        type: 'QUOTE_LOCKED',
        actor: 'system',
      },
    });

    const saved = await Bill.findById(bill._id);
    const execution = await Execution.findById(created.executionId);
    expect(saved?.state).toBe('EXECUTING');
    expect(saved?.version).toBe(bill.version + 1);
    expect(String(saved?.activeExecutionId)).toBe(created.executionId);
    expect(saved?.recentEvents).toHaveLength(1);
    expect(execution?.active).toBe(true);
    expect(execution?.requestId).toBe(`tr:${bill._id}:1`);

    const draft = await Bill.create({
      ...watchingBillInput('draft'),
      state: 'DRAFT',
    });
    await expect(
      createExecution({
        billId: String(draft._id),
        expectedVersion: draft.version,
        mode: 'MANUAL',
        attempt: 1,
        requestId: `tr:${draft._id}:1`,
      }),
    ).rejects.toBeInstanceOf(InvalidStateError);
    expect(await Execution.countDocuments({ billId: draft._id })).toBe(0);

    const racing = await Bill.create(watchingBillInput('race'));
    const attempts = await Promise.allSettled([
      createExecution({
        billId: String(racing._id),
        expectedVersion: racing.version,
        mode: 'TARGET',
        attempt: 1,
        requestId: `tr:${racing._id}:1`,
      }),
      createExecution({
        billId: String(racing._id),
        expectedVersion: racing.version,
        mode: 'DEADLINE',
        attempt: 2,
        requestId: `tr:${racing._id}:2`,
      }),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await Execution.countDocuments({ billId: racing._id, active: true }),
    ).toBe(1);

    const prefix = isolatedPrefix('foundation');
    const url = process.env.REDIS_URL ?? '';
    const queue = createQueue('notify', { url, prefix });
    let ran = false;
    const worker = createWorker(
      'notify',
      async (job) => {
        expect(job.data).toEqual({ notificationId: 'n1' });
        ran = true;
      },
      { url, prefix },
    );
    await worker.waitUntilReady();
    await queue.add(
      'notify',
      { notificationId: 'n1' },
      { jobId: jobIds.notify('n1') },
    );
    await vi.waitFor(() => expect(ran).toBe(true));
    await worker.close();
    await queue.close();
  });
});
