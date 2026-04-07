export const chunkText = (value: string, maxLength = 3500): string[] => {
  if (value.length <= maxLength) {
    return [value];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const slice = value.slice(cursor, cursor + maxLength);
    const newlineIndex = slice.lastIndexOf('\n');
    const end =
      newlineIndex > maxLength * 0.5 ? cursor + newlineIndex + 1 : cursor + slice.length;
    chunks.push(value.slice(cursor, end));
    cursor = end;
  }

  return chunks;
};

