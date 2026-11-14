const HANDOFF_FORMAT = 'smw-mp-trace-debug-handoff/v1';

export function createTraceDebugHandoff(jsonl: string, frameNotes: string) {
  const fence = codeFenceFor([jsonl, frameNotes]);
  const notes = frameNotes.trim() || 'Nessuna annotazione per frame.';

  return [
    `<!-- ${HANDOFF_FORMAT} -->`,
    '# Debug replay Super Mario World',
    '',
    'Riproduci e analizza il problema in questo repository usando le note come osservazioni legate ai frame. Individua il primo frame rilevante, confronta input, tick, stato ed eventi, e separa i fatti osservati dalle ipotesi.',
    '',
    '## Note aggregate per frame',
    `${fence}\n${notes}\n${fence}`,
    '',
    '## Traccia JSONL',
    `${fence}jsonl\n${jsonl}\n${fence}`,
  ].join('\n');
}

function codeFenceFor(contents: string[]) {
  const longest = contents.reduce((maximum, text) => {
    for (const match of text.matchAll(/`+/g)) maximum = Math.max(maximum, match[0].length);
    return maximum;
  }, 0);
  return '`'.repeat(Math.max(3, longest + 1));
}
