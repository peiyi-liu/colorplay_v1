# Phase 0 Manual Readiness

Verified at: `2026-08-06T02:59:35Z`

This checklist records status only. It must never contain account identifiers,
credential values, recovery codes, private keys, or provider payloads.

## Responsibility roles

| Role                         | Current assignment | Release requirement                                                     |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------- |
| Infrastructure owner         | Owner (interim)    | Verified                                                                |
| Release operator             | Owner (interim)    | Verified                                                                |
| Emergency recovery custodian | Owner (interim)    | Blocked: independent custodian is required before formal public release |

## Human readiness status

|   # | Readiness item                                                                                    | Status   | Non-secret verification                                                                                        |
| --: | ------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
|   1 | GitHub, Vercel, Supabase, Cloudflare, Backblaze B2, and SMTP-provider MFA plus recovery readiness | verified | Owner confirmation; no recovery material recorded                                                              |
|   2 | Three responsibility roles and a second recoverable location for recovery material                | blocked  | Owner deferred the USB encrypted copy; implementation may continue, hosted mutation and formal release may not |
|   3 | GitHub CLI browser authentication                                                                 | verified | `gh auth status --hostname github.com`                                                                         |
|   4 | Provider browser sessions and separate Staging/Production SMTP credentials                        | blocked  | Browser access is verified; separate SMTP credentials remain a per-environment hosted setup gate               |
|   5 | Separate B2 writer/recovery keys and age-key custody outside B2                                   | verified | Capability tests passed; age private key is in a locked recovery note                                          |
|   6 | DNS, Vercel domain, Supabase Auth URL, and SMTP-domain management access                          | verified | Owner confirmation; exact changes remain per-operation approvals                                               |
|   7 | Fail-closed owner approval dispatch design                                                        | verified | Approved Phase 0 plan commit `2295fd6`                                                                         |

## Safe status commands

These commands confirm login or tool state without printing credential values:

```bash
gh auth status --hostname github.com
vercel whoami
supabase projects list
```

Do not run commands that print environment variables, tokens, private keys, SMTP
credentials, or recovery codes into a terminal transcript or CI artifact.

## Remaining human gates

The owner's decision to proceed with local implementation does not convert the
blocked readiness items into passes. Before any hosted mutation, Task 13 must
reverify OWNER GATE 0 and produce a fresh sanitized preflight record.

DNS edits, destructive reset, Production promotion, secret entry or rotation,
incident recovery, payment decisions, and real-device acceptance remain separate
per-operation owner approvals. They cannot be pre-approved by this checklist.
