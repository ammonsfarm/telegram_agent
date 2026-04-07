export const summarizeDiff = (diff: string): string => {
  if (!diff.trim()) {
    return 'No diff generated.';
  }

  const lines = diff.split('\n');
  let files = 0;
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      files += 1;
      continue;
    }

    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      additions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }

  return `Changed ${files} file(s), +${additions} / -${deletions} line(s).`;
};

