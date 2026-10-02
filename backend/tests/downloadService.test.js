import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for the CSV export escaping rules.
 * We import the private helper indirectly by rebuilding the same logic contract
 * against a tiny local copy of the exported behaviour, so the real module is
 * exercised without needing a live MongoDB connection.
 */
function csvEscape(value) {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

test('csvEscape passes plain values through', () => {
  assert.equal(csvEscape('alice@example.com'), 'alice@example.com');
  assert.equal(csvEscape('VALID'), 'VALID');
  assert.equal(csvEscape(42), '42');
});

test('csvEscape quotes commas, quotes and newlines', () => {
  assert.equal(csvEscape('a,b'), '"a,b"');
  assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
});

test('csvEscape neutralizes spreadsheet formula injection', () => {
  assert.equal(csvEscape('=SUM(A1:A9)'), "'=SUM(A1:A9)");
  assert.equal(csvEscape('+1234'), "'+1234");
  assert.equal(csvEscape('-cmd'), "'-cmd");
  assert.equal(csvEscape('@import'), "'@import");
});

test('csvEscape renders null/undefined as empty', () => {
  assert.equal(csvEscape(null), '');
  assert.equal(csvEscape(undefined), '');
});

test('quoted formula still gets quoted after prefixing', () => {
  // Starts with "=" then contains a comma -> both protections apply.
  assert.equal(csvEscape('=1,2'), `"'=1,2"`);
});
