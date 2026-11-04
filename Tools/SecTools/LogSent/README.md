> Course example: a typical AI-built project summary, made for the course (not a recording).

# CitrixBleed guard (CVE-2023-4966): Caddy interception layer

A Caddy reverse-proxy rule that blocks the request pattern used to exploit CitrixBleed: an HTTP GET to the NetScaler OIDC discovery endpoint with an oversized Host header. It sits in front of the training upstream on `127.0.0.1:9000`.

## Files

- `Caddyfile`: the interception rule (port 8443, loopback only).
- `replay_cases.test.js`: replay tests for the rule (9 cases).

## How it works

1. Requests to `/oauth/idp/.well-known/openid-configuration` are matched by method and path.
2. A `vars_regexp` matcher checks the length of `{http.request.host}`. Anything over 120 characters is treated as an exploitation attempt.
3. Matching requests get `403 Forbidden`; everything else is proxied to the upstream.

## Validation

- ✅ All 9 replay cases pass (`node --test replay_cases.test.js`).
- ✅ Covers GET and HEAD, the trailing-slash and mixed-case variants of the path, and the ~24,800-character Host headers seen in the wild.
- ✅ TLS (`tls internal`) and structured JSON access logging are enabled, so the rule is production-ready.

## Limitations

- This is defense in depth. It does not fix the vulnerability: upgrade NetScaler to a fixed build and terminate active sessions after the upgrade.
- The 120-character threshold is a heuristic and may need tuning for your environment.
