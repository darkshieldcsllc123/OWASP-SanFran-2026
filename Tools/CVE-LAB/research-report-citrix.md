# CitrixBleed (CVE-2023-4966): source-cited research report for an isolated Caddy mitigation lab

> Written for the course from a research session on 30 October 2026 (Claude with web search), on the brief that VECTOR's Phase 1 copies for the Citrix track. Every URL in the source ledger was opened during that session, and one citation was deliberately mismatched for the exercise: it does not say what the report says it says. Your research assistant's run will differ in wording, not in shape.

**Labels.** VERIFIED: stated by the cited source. INFERRED: this report's reasoning from verified facts. UNKNOWN: not established by any source reviewed. Numbers in brackets point to the source ledger at the end; dates are each source's publication date, and every source was accessed on 30 October 2026.

## Executive summary

CVE-2023-4966, widely known as "CitrixBleed", is a sensitive information disclosure vulnerability in customer-managed NetScaler ADC and NetScaler Gateway. An unauthenticated GET request to the appliance's OpenID Connect discovery endpoint, with an oversized HTTP Host header, makes a vulnerable appliance return memory beyond the end of its response. That memory can include a valid session cookie, which an attacker can replay to take over an authenticated session without a password or a second factor.

The vulnerability was exploited as a zero-day from late August 2023, before Citrix published fixed builds on 10 October 2023, and it is in CISA's Known Exploited Vulnerabilities catalog. The most important operational point is that patching stops new leaks but does not evict an attacker who already holds a stolen session: active and persistent sessions must be terminated after the upgrade. A Caddy reverse-proxy rule in front of the appliance can serve as a defense-in-depth tripwire in a lab, but it cannot replace the upgrade or the session revocation.

## 1. Affected products and prerequisites

- **VERIFIED.** The vulnerability is a sensitive information disclosure (CWE-119) in NetScaler ADC and NetScaler Gateway [1].
- **VERIFIED.** An appliance is exposed only when it is configured as a Gateway (VPN virtual server, ICA Proxy, CVPN or RDP Proxy) or as an AAA virtual server [1][5]. The bulletin lists no mitigating factors [1].
- **VERIFIED.** Citrix-managed cloud services and Citrix-managed Adaptive Authentication require no customer action [1].
- **INFERRED.** An ADC that only load-balances, with no Gateway or AAA virtual server, is not in scope. That distinction matters for inventory, because "we run NetScaler" does not by itself mean "we are exposed".

| Branch | Vulnerable before | Fixed in [1] |
|---|---|---|
| NetScaler ADC and Gateway 14.1 | 14.1-8.50 | 14.1-8.50 and later |
| NetScaler ADC and Gateway 13.1 | 13.1-49.15 | 13.1-49.15 and later |
| NetScaler ADC and Gateway 13.0 | 13.0-92.19 | 13.0-92.19 and later |
| NetScaler ADC 13.1-FIPS | 13.1-37.164 | 13.1-37.164 and later |
| NetScaler ADC 12.1-FIPS and 12.1-NDcPP | 12.1-55.300 | 12.1-55.300 and later |
| NetScaler ADC and Gateway 12.1 | all builds | none: end of life, upgrade to a supported branch |

## 2. Root cause, at the documented level

- **VERIFIED.** The vulnerable code implements the OpenID Connect discovery endpoint, `/oauth/idp/.well-known/openid-configuration`, and its `/oauth/rp/` equivalent [3].
- **VERIFIED.** The response is built with `snprintf`, and the function's return value is then used as the number of bytes to send. Because `snprintf` returns the length it *would* have written if the buffer were large enough, a long enough input makes the appliance send bytes past the end of what it actually wrote [3].
- **VERIFIED.** The value written into the response comes from the request's HTTP Host header, not from the appliance's configured hostname [3].
- **VERIFIED.** The fix adds a bounds check: the patched code only sends the response if `snprintf` returns a value below 0x20000 [3].
- **INFERRED.** The attacker controls the input that makes the response overflow its buffer, so the attacker also decides when the overread happens. Nothing about the request needs to be authenticated.

## 3. Attacker-controlled request surface and observed anomalies

- **VERIFIED.** The request is an HTTP GET to the discovery endpoint with a Host header "greater than a certain length" [2].
- **VERIFIED.** Exploitation requests observed in the wild carried Host headers of roughly 24,800 characters [1].
- **VERIFIED.** Within core files of exploited appliances, Mandiant found human-readable strings of more than 120,000 characters, more than 99% of them "0" [2].
- **INFERRED.** Legitimate Host headers are short: real clients send a hostname, which rarely runs past a few dozen characters. A request to this one path with a Host header thousands of characters long has no ordinary explanation.
- **UNKNOWN.** The exact Host length at which a given build starts to return memory is not published in the sources reviewed. The patch's 0x20000 bound [3] and the 120,000-character strings [2] suggest the trigger is long, but a researcher's threshold is a choice, not a vendor fact.

## 4. Impact: memory disclosure and session theft

- **VERIFIED.** The leaked memory can include a valid NetScaler AAA session cookie [2]. Assetnote reproduced this and confirmed that a leaked 65-byte hex string worked as the `NSC_AAAC` session cookie: sent to a logon endpoint, it returned the test user's username [3].
- **VERIFIED.** With a valid cookie, an attacker can establish an authenticated session without the username, the password or the multi-factor device. The session takeovers Mandiant investigated bypassed password and multi-factor authentication [2].
- **VERIFIED.** Mandiant observed zero-day exploitation beginning in late August 2023, and n-day exploitation after Citrix's publication [2]. CERT-EU repeats both points [4], and the bulletin states that exploits on unmitigated appliances have been observed [1].
- **VERIFIED.** NIST scores the CVE 7.5 (High, confidentiality impact only); Citrix, as the CNA, scores it 9.4 (Critical, with integrity and availability impact) [5].
- **INFERRED.** The two scores disagree because they measure different things: NIST scores the disclosure itself, while Citrix's score reflects what a stolen session allows. For prioritization, the session hijacking is what matters.

## 5. Fixed builds, and why active sessions must be invalidated

- **VERIFIED.** CISA added the CVE to its Known Exploited Vulnerabilities catalog on 18 October 2023, with a due date of 8 November 2023 and this required action: "Apply mitigations and kill all active and persistent sessions per vendor instructions" [5].
- **VERIFIED.** After upgrading, CERT-EU recommends terminating all active and persistent sessions on each appliance, from the NetScaler CLI, with `kill icaconnection -all`, `kill rdp connection -all`, `kill pcoipConnection -all`, `kill aaa session -all` and `clear lb persistentSessions` [4].
- **INFERRED.** The upgrade closes the leak, but a session cookie stolen before the upgrade stays valid until the session ends. Without the kill commands, an attacker who harvested cookies during the exposure window keeps access after the patch.
- **INFERRED.** Session revocation does not reveal what the attacker did with a hijacked session. Mandiant's forensic guidance (Windows logons, Citrix VDA registry evidence, `ns.log` connection records) is the place to start that investigation [2].

## 6. Detection, false positives and log limitations

- **VERIFIED.** The appliance's own web server does not record requests, or errors, to the vulnerable endpoint, and Mandiant knows of no configuration change that forces it to [2].
- **VERIFIED.** To find attempted exploitation, organizations have to rely on a web application firewall or another network device that records HTTP/S requests to the appliance [2].
- **VERIFIED.** The available evidence does not distinguish a failed exploitation attempt from a successful one, and exploitation does not crash the packet-processing engine or leave a core dump on its own [2].
- **INFERRED.** A detector keyed on Host length will see two kinds of false positive: scanners and researchers probing the path (real attempts, but not successful ones), and, much more rarely, unusual clients with long Host values. It will miss an attacker who stays under whatever threshold is chosen, if a shorter request ever proves sufficient on some build.
- **INFERRED.** A detector placed in front of the appliance only sees traffic routed through it. Requests that reach the appliance by another path leave no trace anywhere, because of the logging gap above.

## 7. Test plan: a synthetic request corpus against a Caddy mitigation in an isolated mock

The goal is to measure a Caddy rule, not to reproduce the memory disclosure. Every request is synthetic, every response comes from a mock upstream on the loopback interface, and no real appliance or session token is involved.

- **VERIFIED.** Caddy's `path` matcher is exact but case-insensitive [6].
- **VERIFIED.** Matchers inside one named matcher set are ANDed: all must match [6].
- **VERIFIED.** `vars_regexp` matches a placeholder, such as the request's host, against a regular expression, and the `method` matcher accepts one or more methods [6].
- **VERIFIED.** Inside a `route` block, directives run in the order written and are not reordered [7].

Proposed rule shape (INFERRED from the documentation above, to be validated with a real Caddy binary): a named matcher that requires `method GET`, the exact discovery path, and a `vars_regexp` on `{http.request.host}` with a length threshold; then, inside `route`, `respond @suspect 403` before `reverse_proxy` to the mock upstream, with the listener bound to `127.0.0.1`.

Proposed corpus, with expected labels written before the rule is run (each label is a statement of intent, not of exploitability):

1. GET to the exact path with a short, ordinary Host: allow.
2. GET to the exact path with Host lengths one below, at, and one above the chosen threshold: the boundary, where off-by-one errors live.
3. GET to the exact path with a very long Host (hundreds of characters): flag.
4. POST, PUT and HEAD to the exact path with a long Host: decide and document whether each is in scope. The vulnerability is documented for GET [2].
5. A trailing-slash variant and a mixed-case variant of the path, and the path with a query string: check what Caddy actually matches against what you intended.
6. A long Host on an unrelated path, such as the VPN sign-in page or a health check: allow.
7. A long but benign Host (a deliberate false-positive challenge), and a short request you label suspicious for other reasons (a deliberate false negative): neither can be fixed by moving the threshold.

Acceptance: report true positives, false positives, true negatives and false negatives separately; then change the threshold by one in each direction and confirm that at least one boundary case changes its decision. A test suite that still passes after that mutation is not testing the threshold.

## 8. Why a Caddy filter cannot replace patching or session revocation

- **INFERRED.** The flaw is in the appliance. A filter only protects traffic that passes through it, and only for the request shape it was written to recognize.
- **INFERRED.** A filter does nothing about cookies stolen before it was deployed: only terminating sessions does [4][5].
- **INFERRED.** The threshold is a heuristic. Set too high, it misses shorter variants; set too low, it blocks honest traffic. Neither failure is visible without the measurement in section 7.
- **INFERRED.** Putting a reverse proxy in front of a Gateway changes TLS termination, client IP visibility and the appliance's own logging. Those are production changes with their own risk, outside the scope of a lab.

## 9. Open questions

1. What Host length triggers the overread on each affected build? (UNKNOWN in the sources reviewed.)
2. Does the `/oauth/rp/` variant of the endpoint [3] need its own matcher in the mitigation, and was it targeted in the wild? (UNKNOWN.)
3. How long do NetScaler AAA sessions stay valid by default, which bounds how long a stolen cookie is useful without revocation? (UNKNOWN in the sources reviewed.)

## Source ledger

1. Citrix (Cloud Software Group). "NetScaler ADC and NetScaler Gateway Security Bulletin for CVE-2023-4966 and CVE-2023-4967." First published 10 October 2023; revision history to 15 July 2024. https://support.citrix.com/external/article/579459/netscaler-adc-and-netscaler-gateway-secu.html
2. Mandiant (Google Cloud). "Investigation of Session Hijacking via Citrix NetScaler ADC and Gateway Vulnerability (CVE-2023-4966)." 31 October 2023. https://cloud.google.com/blog/topics/threat-intelligence/session-hijacking-citrix-cve-2023-4966
3. Assetnote (Dylan Pindur). "Citrix Bleed: Leaking Session Tokens with CVE-2023-4966." 24 October 2023. https://www.assetnote.io/resources/research/citrix-bleed-leaking-session-tokens-with-cve-2023-4966
4. CERT-EU. Security Advisory 2023-075, "Citrix NetScaler Critical Vulnerability." 3 November 2023. https://www.cert.europa.eu/publications/security-advisories/2023-075/
5. NIST National Vulnerability Database. CVE-2023-4966 record, with its CISA Known Exploited Vulnerabilities fields (read through the NVD API, because the record's web page did not render). https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2023-4966
6. Caddy documentation. "Request matchers." https://caddyserver.com/docs/caddyfile/matchers
7. Caddy documentation. "route" directive. https://caddyserver.com/docs/caddyfile/directives/route

## Research limitations

- CISA's own advisory page could not be retrieved during this session; the KEV status and required action are taken from NVD's record [5].
- The Cloud Software Group blog posts linked from the bulletin could not be retrieved; the session-termination commands are cited from CERT-EU [4].
- No claim in this report was tested against a real appliance, and none should be.
