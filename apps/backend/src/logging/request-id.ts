import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

export function resolveRequestId(value: string | string[] | undefined): string {
  return typeof value === 'string' && value.length <= 64 && /^[A-Za-z0-9._-]+$/.test(value)
    ? value
    : randomUUID();
}
