import { describe, expect, it } from 'vitest';

import { AuthService, AuthorizationError } from '../src/security/auth';

describe('AuthService', () => {
  it('authorizes configured users only', () => {
    const auth = new AuthService([1, 2]);

    expect(auth.isAuthorized(1)).toBe(true);
    expect(auth.isAuthorized(3)).toBe(false);
    expect(() => auth.assertAuthorized(3)).toThrow(AuthorizationError);
  });
});

