# ColorPlay environment matrix

## Isolation contract

| Control                  | Local                                                 | Staging                                                         | Production                                                         |
| ------------------------ | ----------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Frontend target          | Vite dev server or built preview                      | Vercel Preview                                                  | Vercel Production                                                  |
| Git source               | Developer worktree                                    | Pull request/non-`main` commit                                  | Protected `main` commit                                            |
| Supabase target          | Supabase CLI local stack                              | Destructively rebuilt legacy hosted project                     | New clean hosted project                                           |
| Data                     | Deterministic synthetic seeds                         | Synthetic test/acceptance data only                             | Approved formal content and real authorized users only             |
| Browser variables        | Local public values loaded by reviewed helper         | Preview-scoped `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` | Production-scoped `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| Auth Site URL            | Local application URL                                 | Stable Staging/Preview URL selected for Auth                    | Canonical Production domain                                        |
| Auth redirects           | Exact local routes used by tests                      | Staging Preview wildcard only where required                    | Exact Production routes; no Preview wildcard                       |
| Server secrets           | Local CLI output consumed without logging, then unset | Supabase/Vercel server-only stores owned by release operator    | Supabase/Vercel server-only stores owned by production operator    |
| Schema authority         | Repository migrations and local reset                 | Same migrations after protected Staging deploy                  | Same migrations from zero after Production approval                |
| Automated mutation tests | Allowed after local reset                             | Allowed against synthetic Staging data                          | Forbidden                                                          |
| Acceptance evidence      | May identify `local`                                  | May identify `staging`                                          | Release smoke only; no automated destructive acceptance            |
| Storage                  | Synthetic reviewed fixtures                           | Synthetic reviewed assets                                       | Approved assets with independent backup                            |
| Deployment authority     | Developer                                             | CI plus release operator                                        | Protected environment approver plus production operator            |
| Current Phase 0 state    | Existing                                              | Reset/linking `NOT EXECUTED`                                    | Project creation/linking `NOT EXECUTED`                            |

No environment may reuse another environment's Supabase URL, public key, Auth users, database password, service credential, SMTP credential, or formal data. Preview maps only to Staging. Production from `main` maps only to the new clean Production project.

## Browser configuration boundary

The browser allowlist contains exactly:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

These names hold public connection configuration, not authorization bypasses. RLS remains mandatory. Database URLs/passwords, JWT secrets, service credentials, SMTP passwords, access tokens, backup keys, and monitoring write keys never use a `VITE_` prefix and never enter source, logs, artifacts, or the browser bundle.

## Auth URL lifecycle

1. Local uses the tracked CLI Site URL and redirect configuration.
2. Staging receives its own Site URL and Preview redirect policy after the legacy project reset.
3. Production initially uses the canonical Vercel Production URL.
4. When the formal custom domain is selected, the account owner updates DNS, Supabase Site URL, exact redirect URLs, email links, and monitoring checks as one reviewed change.
5. A deployment using mismatched frontend and Supabase environments fails the release gate; it is never repaired by adding broad Production redirects.

## Database release boundary

- Feature CI proves migrations against Local.
- A release candidate applies the same tracked migrations to Staging and completes the applicable phase gate.
- Production migration requires a protected-environment approval, recorded migration range, preflight backup status, backward-compatible application check, and post-migration smoke result.
- A failed frontend deploy rolls back to a known Git SHA. A failed database change uses the reviewed forward-fix/expand-contract path; no untracked Dashboard edit is accepted as recovery.
- Every deployment record binds frontend SHA, migration version, environment, operator, start/end UTC time, and outcome.
