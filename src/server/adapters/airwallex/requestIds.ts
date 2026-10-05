const MAX_LENGTH = 64;

function bounded(id: string): string {
  if (id.length > MAX_LENGTH) {
    throw new Error(`request_id exceeds ${MAX_LENGTH} characters`);
  }
  return id;
}

function attemptNo(attempt: number): void {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('attempt starts at 1');
  }
}

/** Layer B scheduled transfer. Distinct from `tr:{billId}:{attempt}` so it cannot collide with the quote payment. */
export function safetyNetRequestId(billId: string): string {
  return bounded(`sn:${billId}`);
}

/** Transfer create. `attempt` increments only after a terminal failure. */
export function transferRequestId(billId: string, attempt: number): string {
  attemptNo(attempt);
  return bounded(`tr:${billId}:${attempt}`);
}

export function conversionRequestId(billId: string, attempt: number): string {
  attemptNo(attempt);
  return bounded(`cv:${billId}:${attempt}`);
}

export function beneficiaryRequestId(billId: string): string {
  return bounded(`bf:${billId}`);
}
