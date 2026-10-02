import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAllowedFile, safeStoredName, sanitizeDisplayFilename, extractEmails,
} from '../src/services/fileService.js';

test('isAllowedFile accepts csv/xls/xlsx', () => {
  assert.equal(isAllowedFile('list.csv', 'text/csv'), true);
  assert.equal(isAllowedFile('list.XLSX', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), true);
  assert.equal(isAllowedFile('list.xls', 'application/vnd.ms-excel'), true);
});

test('isAllowedFile rejects other extensions', () => {
  assert.equal(isAllowedFile('list.txt', 'text/plain'), false);
  assert.equal(isAllowedFile('malware.exe', 'application/octet-stream'), false);
  assert.equal(isAllowedFile('image.png', 'image/png'), false);
  assert.equal(isAllowedFile('noextension', ''), false);
});

test('safeStoredName strips path traversal and keeps extension', () => {
  const name = safeStoredName('../../etc/passwd.csv');
  assert.ok(!name.includes('..'), `no traversal in ${name}`);
  assert.ok(!name.includes('/'), `no slash in ${name}`);
  assert.ok(!name.includes('\\'), `no backslash in ${name}`);
  assert.ok(name.endsWith('.csv'), `keeps extension in ${name}`);
  assert.match(name, /^[a-zA-Z0-9_-]+-\d{13}-[a-z0-9]+\.csv$/);
});

test('safeStoredName falls back when name has no usable base', () => {
  const name = safeStoredName('///.csv');
  assert.ok(name.endsWith('.csv'));
  assert.ok(name.length > 4);
});

test('sanitizeDisplayFilename removes newlines and paths', () => {
  assert.equal(sanitizeDisplayFilename('C:\\temp\\evil\r\nname.csv'), 'evilname.csv');
  assert.equal(sanitizeDisplayFilename(null), 'file');
});

test('extractEmails dedupes, lowercases and counts', () => {
  const rows = [
    ['Alice@Example.com'],
    ['bob@test.org'],
    ['ALICE@example.com'],   // duplicate (case-insensitive)
    ['   carol@x.io   '],
    [''],                    // skipped
    ['not-an-email'],        // kept but malformed
  ];
  const out = extractEmails(rows, 0);

  assert.equal(out.totalEmails, 5);           // 4 real + 1 malformed (blank skipped)
  assert.equal(out.uniqueEmails.length, 4);
  assert.equal(out.duplicateCount, 1);
  assert.equal(out.malformedCount, 1);
  assert.ok(out.uniqueEmails.includes('alice@example.com'));
  assert.ok(out.uniqueEmails.includes('carol@x.io'));
  assert.ok(out.uniqueEmails.includes('not-an-email'));
});

test('extractEmails unwraps Name <addr@x.com>', () => {
  const rows = [['Alice Wonder <alice@wonderland.io>']];
  const out = extractEmails(rows, 0);
  assert.deepEqual(out.uniqueEmails, ['alice@wonderland.io']);
});

test('extractEmails respects maxEmails cap', () => {
  const rows = Array.from({ length: 50 }, (_, i) => [`user${i}@example.com`]);
  const out = extractEmails(rows, 0, { maxEmails: 10 });
  assert.equal(out.uniqueEmails.length, 10);
});
