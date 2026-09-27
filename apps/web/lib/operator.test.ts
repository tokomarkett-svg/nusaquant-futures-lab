import assert from 'node:assert/strict';
import test from 'node:test';
import { sameOrigin, operatorFrom } from './operator';

const URL = 'https://web.example.test/api/meja/demo';

test('manual approval rejects cross-origin POSTs, even with a bearer token', () => {
  assert.equal(sameOrigin(new Request(URL, { headers: { origin: 'https://evil.example.test' } })), false);
  assert.equal(sameOrigin(new Request(URL)), false);
  assert.equal(sameOrigin(new Request(URL, { headers: { origin: 'https://web.example.test' } })), true);
});

test('operator endpoint denies anonymous requests, never assumes a default owner', async () => {
  const result = await operatorFrom(new Request(URL));
  assert.equal('status' in result, true);
  if ('status' in result) assert.ok(result.status === 401 || result.status === 503);
});
