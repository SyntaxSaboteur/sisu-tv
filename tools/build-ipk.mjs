#!/usr/bin/env node
/*
 * Sisu TV - dependency-free IPK builder.
 *
 * An IPK is a Debian "ar" archive holding three members:
 *   debian-binary   the text "2.0\n"
 *   control.tar.gz  package metadata (./control)
 *   data.tar.gz     the payload under ./usr/palm/...
 *
 * LG's ares-package produces the same layout, but requiring the webOS SDK just
 * to zip a 60 KB app is a poor trade. This writes the ar and ustar formats
 * directly with Node's zlib, so `npm run package` works on any machine.
 *
 * Usage: node tools/build-ipk.mjs [--out build]
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const APP_DIR = join(ROOT, 'app');

/* ---------- tar (ustar) ---------- */

function pad(value, width) {
  // tar stores every numeric field in octal, not decimal.
  return Number(value).toString(8).padStart(width - 1, '0') + '\0';
}

function header({ name, size, mode, type, mtime }) {
  const buf = Buffer.alloc(512, 0);

  let prefix = '';
  let base = name;
  if (Buffer.byteLength(base) > 100) {
    const cut = base.lastIndexOf('/', 154);
    if (cut < 0) throw new Error(`Path too long for ustar: ${name}`);
    prefix = base.slice(0, cut);
    base = base.slice(cut + 1);
    if (Buffer.byteLength(prefix) > 155 || Buffer.byteLength(base) > 100) {
      throw new Error(`Path too long for ustar: ${name}`);
    }
  }

  buf.write(base, 0, 100, 'utf8');
  buf.write(pad(mode, 8), 100, 'ascii');
  buf.write(pad(0, 8), 108, 'ascii');
  buf.write(pad(0, 8), 116, 'ascii');
  buf.write(pad(size, 12), 124, 'ascii');
  buf.write(pad(mtime, 12), 136, 'ascii');
  buf.write('        ', 148, 'ascii');
  buf.write(type, 156, 'ascii');
  buf.write('ustar\0', 257, 'ascii');
  buf.write('00', 263, 'ascii');
  buf.write('root', 265, 'ascii');
  buf.write('root', 297, 'ascii');
  buf.write(pad(0, 8), 329, 'ascii');
  buf.write(pad(0, 8), 337, 'ascii');
  buf.write(prefix, 345, 155, 'utf8');

  let sum = 0;
  for (let i = 0; i < 512; i++) sum += buf[i];
  buf.write(String(sum.toString(8)).padStart(6, '0') + '\0 ', 148, 'ascii');
  return buf;
}

function walk(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    const rel = relative(base, full).split(sep).join('/');
    if (entry.isDirectory()) {
      out.push({ rel, dir: true, full });
      out.push(...walk(full, base));
    } else if (entry.isFile()) {
      out.push({ rel, dir: false, full });
    }
  }
  return out;
}

/* ---------- ar ---------- */

function arMember(name, data, mtime) {
  if (name.length > 16) throw new Error(`ar member name too long: ${name}`);
  const head = Buffer.alloc(60, 0x20);
  head.write(name, 0, 16, 'ascii');
  head.write(String(mtime), 16, 12, 'ascii');
  head.write('0', 28, 6, 'ascii');
  head.write('0', 34, 6, 'ascii');
  head.write('100644', 40, 8, 'ascii');
  head.write(String(data.length), 48, 10, 'ascii');
  head.write('`\n', 58, 2, 'ascii');
  const body = data.length % 2 ? Buffer.concat([data, Buffer.from('\n')]) : data;
  return Buffer.concat([head, body]);
}

function makeAr(members) {
  const parts = [Buffer.from('!<arch>\n', 'ascii')];
  for (const member of members) parts.push(arMember(member.name, member.data, member.mtime));
  return Buffer.concat(parts);
}

/* ---------- package ---------- */

export function buildIpk({ appDir = APP_DIR, outDir = join(ROOT, 'build') } = {}) {
  const appinfo = JSON.parse(readFileSync(join(appDir, 'appinfo.json'), 'utf8'));
  const id = appinfo.id;
  const version = appinfo.version;
  const mtime = Number(process.env.SOURCE_DATE_EPOCH || Math.floor(Date.now() / 1000));

  const appEntries = walk(appDir).map((entry) => ({
    ...entry,
    rel: `usr/palm/applications/${id}/${entry.rel}`
  }));

  const packageinfo = {
    id,
    version,
    app: id
  };
  const packageinfoRel = `usr/palm/packages/${id}/packageinfo.json`;
  const packageJsonBuf = Buffer.from(`${JSON.stringify(packageinfo, null, 2)}\n`, 'utf8');

  const dataEntries = appEntries.concat([
    { rel: packageinfoRel, dir: false, buffer: packageJsonBuf }
  ]);

  const dataChunks = [];
  for (const entry of dataEntries) {
    const isDir = !!entry.dir;
    if (isDir) {
      dataChunks.push(header({ name: `${entry.rel}/`, size: 0, mode: 0o755, type: '5', mtime }));
      continue;
    }
    const data = entry.buffer || readFileSync(entry.full);
    dataChunks.push(header({ name: entry.rel, size: data.length, mode: 0o644, type: '0', mtime }));
    dataChunks.push(data);
    const remainder = data.length % 512;
    if (remainder) dataChunks.push(Buffer.alloc(512 - remainder, 0));
  }
  dataChunks.push(Buffer.alloc(1024, 0));
  const dataTar = gzipSync(Buffer.concat(dataChunks), { level: 9 });

  const totalSize = dataEntries
    .filter((entry) => !entry.dir)
    .reduce((sum, entry) => sum + (entry.buffer ? entry.buffer.length : statSync(entry.full).size), 0);

  const control = [
    `Package: ${id}`,
    `Version: ${version}`,
    'Section: misc',
    'Priority: optional',
    'Architecture: all',
    `Installed-Size: ${totalSize}`,
    `Maintainer: ${appinfo.vendor || 'unknown'} <noreply@example.com>`,
    `Description: ${appinfo.appDescription || appinfo.title || id}`,
    'webOS-Package-Format-Version: 2',
    'webOS-Packager-Version: 3.0.2',
    ''
  ].join('\n');

  const controlEntry = {
    rel: 'control',
    dir: false,
    buffer: Buffer.from(control, 'utf8')
  };
  const controlChunks = [];
  controlChunks.push(header({ name: controlEntry.rel, size: controlEntry.buffer.length, mode: 0o644, type: '0', mtime }));
  controlChunks.push(controlEntry.buffer);
  controlChunks.push(Buffer.alloc(512 - (controlEntry.buffer.length % 512 || 512), 0));
  controlChunks.push(Buffer.alloc(1024, 0));
  const controlTar = gzipSync(Buffer.concat(controlChunks), { level: 9 });

  const ipk = makeAr([
    { name: 'debian-binary', data: Buffer.from('2.0\n', 'ascii'), mtime },
    { name: 'control.tar.gz', data: controlTar, mtime },
    { name: 'data.tar.gz', data: dataTar, mtime }
  ]);

  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `${id}_${version}_all.ipk`);
  writeFileSync(file, ipk);

  return {
    file,
    bytes: ipk.length,
    sha256: createHash('sha256').update(ipk).digest('hex'),
    payloadBytes: totalSize,
    files: dataEntries.filter((entry) => !entry.dir).length
  };
}

/* ---------- CLI ---------- */

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const outIndex = process.argv.indexOf('--out');
  const outDir = outIndex > -1 ? resolve(process.argv[outIndex + 1]) : join(ROOT, 'build');
  if (process.argv.includes('--clean')) rmSync(outDir, { recursive: true, force: true });

  const result = buildIpk({ outDir });
  console.log(`IPK      ${relative(ROOT, result.file)}`);
  console.log(`size     ${(result.bytes / 1024).toFixed(1)} KiB`);
  console.log(`files    ${result.files}`);
  console.log(`sha256   ${result.sha256}`);
}
