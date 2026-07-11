# Security Policy

## Supported versions

`logistics-ts` is pre-1.0 and under active development. Security fixes are
applied to the latest published `0.x` release only. Pin a version and upgrade
promptly until a stable `1.0` line exists.

| Version | Supported |
| ------- | --------- |
| latest `0.x` | ✅ |
| older `0.x`  | ❌ |

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Please report privately via GitHub's
[**Report a vulnerability**](https://github.com/adam-drag/logistics-ts/security/advisories/new)
form (Security → Advisories → Report a vulnerability). This opens a private
advisory visible only to the maintainers.

If you cannot use the form, email the maintainer listed on the npm package
([`logistics-ts`](https://www.npmjs.com/package/logistics-ts)) instead.

Please include:

- affected package(s) and version(s),
- a description of the issue and its impact,
- reproduction steps or a proof of concept, if available.

## What to expect

- **Acknowledgement** within 7 days.
- An initial assessment and severity triage shortly after.
- Coordinated disclosure: we will agree on a timeline before any public
  disclosure and credit you in the advisory unless you prefer to remain
  anonymous.

## Scope

This project is a set of **pure, dependency-light computation libraries** — it
performs no I/O, network, filesystem, or shell access, and stores no data.
Realistic concerns are limited to things like denial-of-service via pathological
inputs (e.g. unbounded loops), prototype pollution through the column-mapping
loaders, or a compromised dependency in the toolchain. Reports in those areas
are especially welcome.
