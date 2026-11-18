import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import test from 'node:test';
import { staticHandler } from '../apps/server/src/http/static.ts';

test('serves WAV assets with an audio content type', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'smw-static-audio-'));
  const assets = join(directory, 'generated');
  await mkdir(join(assets, 'audio'), { recursive: true });
  const wav = Buffer.alloc(46);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(2, 40);
  await writeFile(join(assets, 'audio', 'splat.wav'), wav);

  try {
    const handler = staticHandler(join(directory, 'dist'), assets);
    const request = {
      method: 'GET',
      url: '/assets/audio/splat.wav',
      headers: {},
    } as IncomingMessage;
    const response = new PassThrough();
    let statusCode = 0;
    let contentType = '';
    (response as unknown as ServerResponse).writeHead = ((status: number, headers?: Record<string, string>) => {
      statusCode = status;
      contentType = headers?.['Content-Type'] ?? '';
      return response as unknown as ServerResponse;
    }) as ServerResponse['writeHead'];
    const body: Buffer[] = [];
    response.on('data', (chunk: Buffer) => body.push(chunk));
    const completed = finished(response);

    await handler(request, response as unknown as ServerResponse);
    await completed;

    assert.equal(statusCode, 200);
    assert.equal(contentType, 'audio/wav');
    assert.deepEqual(Buffer.concat(body), wav);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
