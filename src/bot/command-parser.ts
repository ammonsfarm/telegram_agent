export interface ParsedCommand {
  name: string;
  args: string[];
}

export const parseCommand = (text: string): ParsedCommand | null => {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const parts = trimmed.split(/\s+/);
  const [rawName, ...args] = parts;
  if (!rawName) {
    return null;
  }
  const name = rawName.split('@')[0] ?? rawName;
  return { name, args };
};
