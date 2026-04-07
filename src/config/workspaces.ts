export class WorkspacePolicy {
  constructor(private readonly aliases: Record<string, string>) {}

  resolve(alias: string): string {
    const value = this.aliases[alias];
    if (!value) {
      throw new Error(`Unknown workspace alias: ${alias}`);
    }

    return value;
  }

  list(): string[] {
    return Object.keys(this.aliases).sort();
  }
}

