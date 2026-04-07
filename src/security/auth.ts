export class AuthorizationError extends Error {
  constructor(userId: number | null | undefined) {
    super(`Unauthorized user: ${userId ?? 'unknown'}`);
  }
}

export class AuthService {
  private readonly allowedUserIds: Set<number>;

  constructor(allowedUserIds: number[]) {
    this.allowedUserIds = new Set(allowedUserIds);
  }

  isAuthorized(userId: number | null | undefined): boolean {
    return typeof userId === 'number' && this.allowedUserIds.has(userId);
  }

  assertAuthorized(userId: number | null | undefined): void {
    if (!this.isAuthorized(userId)) {
      throw new AuthorizationError(userId);
    }
  }
}

