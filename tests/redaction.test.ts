import { describe, expect, it } from 'vitest';

import { redactSensitiveText } from '../src/security/redaction';

describe('redactSensitiveText', () => {
  it('redacts common secret markers', () => {
    const output = redactSensitiveText(
      'token=abc123 api_key: xyz password="secret" bearer token-value'
    );

    expect(output).not.toContain('abc123');
    expect(output).not.toContain('xyz');
    expect(output).not.toContain('secret');
    expect(output).toContain('[REDACTED]');
  });
});

