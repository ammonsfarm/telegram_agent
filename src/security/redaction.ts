const PATTERNS = [
  /(api[_-]?key\s*[:=]\s*)(["']?)[^\s"']+\2/gi,
  /(token\s*[:=]\s*)(["']?)[^\s"']+\2/gi,
  /(secret\s*[:=]\s*)(["']?)[^\s"']+\2/gi,
  /(password\s*[:=]\s*)(["']?)[^\s"']+\2/gi,
  /(bearer\s+)[a-z0-9\-._~+/]+=*/gi,
  /\bghp_[a-z0-9]{20,}\b/gi,
  /\bsk-[a-z0-9]{20,}\b/gi
] as const;

export const redactSensitiveText = (input: string): string => {
  return PATTERNS.reduce((value, pattern) => value.replace(pattern, '$1[REDACTED]'), input);
};

