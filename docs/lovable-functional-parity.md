# Independent functional parity with Lovable

Observed 2026-09-23. Reference implementation: abi/screenshot-to-code at d026163f586dfa8c5c10d28c36edd59a9d3b0e88 (MIT). Target baseline c172a1b.

This is a capability map, not a claim that Lovable platform source was recovered. The authorized Lovable connector exposes generated user projects, files, edit history and documented actions, not the proprietary platform implementation. A representative user-owned application's file listing and package manifest were inspected read-only. Its private files, downloaded web bundles, tracking scripts, fonts, credentials and business logic were not imported or committed here. Public product behavior is reimplemented independently.

## Sources and scope
- Plan / Chat / Build: https://docs.lovable.dev/features/plan-mode
- Preview selection, inline edits and annotations: https://docs.lovable.dev/features/preview-toolbar
- Git synchronization: https://docs.lovable.dev/integrations/github
- Managed backend: https://docs.lovable.dev/integrations/cloud
- Testing: https://docs.lovable.dev/features/testing
- Knowledge: https://docs.lovable.dev/features/knowledge

## Capability tree
| Capability | Open Lovable implementation | Parity boundary |
|---|---|---|
| Persistent projects and code | SQLite, files, revisions, history, restore | Individual installation; no team workspace management |
| AI build requests | Explicit model resolution, candidate compilation, approval | No claim of equivalent agent autonomy or quality |
| Visual input | Normalized raster references and actual multimodal message parts | Model must support vision; no video or Figma-native import |
| Before/after visual inspection | Reference and live preview side by side, viewport widths | Human comparison, not automated similarity certification |
| Plan mode | Same durable runs; stores a plan without applying code | No subagent investigation or versioned interactive plan editor |
| Code view | File editor and candidate comparison | Not a full IDE or inline DOM-to-source editor |
| Project knowledge | Text references and selected visual references | No complete semantic memory or shared design-system engine |
| Import / export | ZIP files with validation | Source export, not complete Git bidirectional sync |
| Model configuration | Server-side encrypted keys and explicit catalog | Individual operator, not tenant-specific billing |
| Backend / auth / storage | Legacy external sandbox flow retained | Managed database, storage, edge functions and user auth are not implemented |
| Publishing | No automatic deployment in this increment | Hosting, TLS, domains, rollback and release approvals remain separate |
| Teams, SSO, enterprise permissions | Not implemented | Cannot claim SaaS multitenancy or commercial parity |
| Visual editor, comments and annotations | Not implemented | Requires reliable DOM-to-source mapping and collaboration |
