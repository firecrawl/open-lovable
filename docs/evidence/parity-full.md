# Capability Ledger — Open Lovable V2/V2.1

**Assessment revision:** `4988533cc45c88068d3eaae70e3c96b7f2039ef8`
**Assessment scope:** local contracts and automated evidence only.
**Release status:** **NOT READY / BLOCKED**. This document does not claim production parity.

| Capability group | State | Evidence | Remaining limitation |
|---|---|---|---|
| Durable runs, approvals, budgets and recovery | Implemented locally | Roadmap suites P06–P19, P36; regular `npm test` | Hosted PostgreSQL and production worker homologation remain external blockers. |
| Visual source mapping, editing and comparison | Implemented locally | Roadmap suites P20–P23, P51, P58 | Browser-session inspection and third-party design sources were not used. |
| Backend, tenancy, connectors and collaboration | Implemented locally | Roadmap suites P24–P40, P55, P61 | Cloud providers, IdP/SSO, external connectors and notifications were not homologated. |
| Knowledge, assets, video and research | Implemented locally | Roadmap suites P41–P43, P57, P65 | OCR/embeddings, media providers, external search and renderers remain blocked. |
| Templates, app integrations and release evidence | Implemented locally | Roadmap suites P44–P50, P62, P66 | Real payment/email/analytics, pilot and hosting infrastructure remain blocked. |
| Model routing and experiments | Implemented as guarded contracts | Roadmap suites P54, P60, P67 | No authorized model pool, hardware, weights or customer dataset benchmark was run. |
| Mobile output | Partial | Roadmap suite P64 | Native toolchain, emulator/device, signing and store distribution were not run. |
| Voice channel and real business operations | Blocked | No external call or channel was attempted | Requires PBX/SIP, consent, licensing, authorized numbers and explicit approval. |

The ledger deliberately distinguishes **implemented local behavior** from **homologated external behavior**. A passing local test cannot certify a third-party provider, production deployment, payment, communication, domain, store, or hardware workflow. The final internal audit also verified tenant-scope tests (`9/9` unit and `1/1` Playwright), accessibility fixes, preview E2E (`8/8`), dependency audit (`0` high/critical findings), and full local gates (`226` unit/integration, `131` roadmap, `8` P00). Any capability without local evidence must remain partial, incomplete, or explicitly `BLOCKED_BY_EXTERNAL_DEPENDENCY`; no denominator is reduced to manufacture a 100% result.

## Required next gates

The internal product, engineering, security/privacy and accessibility audit gates are green for this branch. The project still requires hosted PostgreSQL/S3/provider homologation where applicable and authorized release review. Merge to `main`, production publication, real billing, external communications, domain/TLS changes, and store distribution remain outside the current authorization scope.
