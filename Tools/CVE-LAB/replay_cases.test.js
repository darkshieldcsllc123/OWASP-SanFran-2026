// Course example: a typical AI-built test, made for the course (not a recording).
//
// Replay tests for the CitrixBleed guard in ../Caddyfile.
// Run with: node --test replay_cases.test.js

const test = require('node:test');
const assert = require('node:assert/strict');

const OIDC_PATH = '/oauth/idp/.well-known/openid-configuration';
const HOST_LIMIT = 120; // Host headers longer than this are treated as suspicious

// Mirrors the @suspect matcher in the Caddyfile.
function isSuspect(req) {
  const methodMatches = req.method === 'GET' || req.method === 'HEAD';
  const pathMatches = req.path.toLowerCase().startsWith(OIDC_PATH);
  return methodMatches && pathMatches && req.host.length > HOST_LIMIT;
}

const host = (n) => 'vpn.' + 'a'.repeat(Math.max(0, n - 4));

const cases = [
  { id: 'R01', method: 'GET', path: OIDC_PATH, host: host(32), expectBlocked: false, why: 'normal discovery request' },
  { id: 'R02', method: 'GET', path: OIDC_PATH, host: host(121), expectBlocked: true, why: 'just over the limit' },
  { id: 'R03', method: 'GET', path: OIDC_PATH, host: host(400), expectBlocked: true, why: 'oversized Host' },
  { id: 'R04', method: 'GET', path: OIDC_PATH, host: host(24800), expectBlocked: true, why: 'in-the-wild size' },
  { id: 'R05', method: 'POST', path: OIDC_PATH, host: host(400), expectBlocked: false, why: 'not a GET' },
  { id: 'R06', method: 'HEAD', path: OIDC_PATH, host: host(400), expectBlocked: true, why: 'HEAD behaves like GET' },
  { id: 'R07', method: 'GET', path: '/vpn/index.html', host: host(400), expectBlocked: false, why: 'other route' },
  { id: 'R08', method: 'GET', path: OIDC_PATH + '/', host: host(400), expectBlocked: true, why: 'trailing slash variant' },
  { id: 'R09', method: 'GET', path: '/OAuth/idp/.well-known/openid-configuration', host: host(200), expectBlocked: true, why: 'mixed case' },
];

for (const c of cases) {
  test(`${c.id}: ${c.why}`, () => {
    assert.equal(isSuspect(c), c.expectBlocked);
  });
}
