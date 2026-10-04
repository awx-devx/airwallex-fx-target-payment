import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '@/proxy';

describe('proxy request id', () => {
  it('echoes an incoming request id', () => {
    const response = proxy(
      new NextRequest('http://localhost/api/stream', {
        headers: { 'x-request-id': 'req-7' },
      }),
    );
    expect(response.headers.get('x-request-id')).toBe('req-7');
  });

  it('assigns a request id when the caller did not', () => {
    const response = proxy(new NextRequest('http://localhost/api/stream'));
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
