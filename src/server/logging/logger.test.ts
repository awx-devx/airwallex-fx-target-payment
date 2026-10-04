import { describe, expect, it } from 'vitest';
import { captureLogs, logAirwallexCall } from '@/server/logging/logger';
import { requestIdFrom, requestLogger } from '@/server/http/requestId';

describe('logger', () => {
  it('writes JSON with trace_id and redacts secrets', () => {
    const { logger, lines } = captureLogs();
    logAirwallexCall(logger, {
      method: 'POST',
      path: '/api/v1/transfers/create',
      status: 201,
      traceId: 'trace-123',
      latencyMs: 40,
      requestId: 'req-9',
    });
    logger.info(
      {
        apiKey: 'super-secret',
        headers: { authorization: 'Bearer token' },
        AIRWALLEX_API_KEY: 'awx-key',
      },
      'call',
    );

    const [airwallex, redacted] = lines();
    expect(airwallex).toMatchObject({
      msg: 'airwallex',
      trace_id: 'trace-123',
      request_id: 'req-9',
      method: 'POST',
      status: 201,
    });
    expect(JSON.stringify(lines())).not.toContain('super-secret');
    expect(JSON.stringify(lines())).not.toContain('Bearer token');
    expect(JSON.stringify(lines())).not.toContain('awx-key');
    expect(redacted?.apiKey).toBe('[Redacted]');
  });

  it('keeps an incoming request id and generates one when missing', () => {
    const kept = requestIdFrom(new Headers({ 'x-request-id': 'req-1' }));
    expect(kept).toBe('req-1');
    expect(requestIdFrom(new Headers())).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    const { logger, lines } = captureLogs();
    requestLogger(new Headers({ 'x-request-id': 'req-1' }), logger).info(
      'hello',
    );
    expect(lines()[0]).toMatchObject({ request_id: 'req-1', msg: 'hello' });
  });
});
