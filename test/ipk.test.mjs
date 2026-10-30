import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildIpk } from '../tools/build-ipk.mjs';

function arMembers(buffer) {
  assert.equal(buffer.subarray(0, 8).toString('ascii'), '!<arch>\n');
  const members = [];
  let offset = 8;
  while (offset + 60 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 60);
    const name = header.subarray(0, 16).toString('ascii').trim();
    const size = Number.parseInt(header.subarray(48, 58).toString('ascii').trim(), 10);
    if (!name || Number.isNaN(size)) break;
    const start = offset + 60;
    members.push({ name, size, data: buffer.subarray(start, start + size) });
    offset = start + size + (size % 2);
  }
  return members;
}

test('builds a Debian-format IPK the webOS installer accepts', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'sisu-ipk-'));
  try {
    const result = buildIpk({ outDir });
    const buffer = readFileSync(result.file);
    const members = arMembers(buffer);

    assert.deepEqual(members.map((member) => member.name), [
      'debian-binary',
      'control.tar.gz',
      'data.tar.gz'
    ]);

    assert.equal(members[0].data.toString('ascii'), '2.0\n');
    assert.equal(members[1].data[0], 0x1f, 'control.tar.gz is gzip');
    assert.equal(members[1].data[1], 0x8b);
    assert.equal(members[2].data[0], 0x1f, 'data.tar.gz is gzip');
    assert.equal(members[2].data[1], 0x8b);

    assert.match(result.sha256, /^[0-9a-f]{64}$/);
    assert.ok(result.bytes > 10_000);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
