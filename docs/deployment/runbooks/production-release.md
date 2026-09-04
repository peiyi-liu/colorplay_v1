# Production Candidate and exact-artifact promotion

Production is never released by updating `main` or rebuilding after approval.
The Candidate and Promotion workflows use separate GitHub Environments and
different Vercel credentials.

## Candidate

Dispatch `Create Production Candidate` with the exact SHA, the exact successful
Staging and backup run URLs, and the verified previous healthy deployment ID.
The SHA must already have every CI check, `owner-approval`, `staging-gate`, and
`backup-freshness` green. The workflow builds with Production public config in
`colorplay-web`, then uses `--prod --skip-domain`; it never changes the
Production domain.

Candidate success requires deployment protection, a candidate-only Vercel URL,
zero Staging markers, no redirect to Staging, GET/HEAD-only browser health, zero
fixture identities, and the approved formal content inventory. The artifact ID,
URL, SHA, Supabase ref, migration range, previous healthy deployment and gate
evidence are stored in a checksummed draft release record. Never upload raw
database output or credentials.

## Promotion

Dispatch `Promote Production Candidate` with the successful Candidate run ID.
GitHub pauses at the protected `production` Environment. After the owner reviews
the exact record/checksum and approves with fresh MFA, the workflow promotes the
recorded artifact; it performs no build and no second deployment.

Three immediate read-only Production samples must pass before `main` can be
fast-forwarded to the approved SHA. The workflow then proves `origin/main`, the
Vercel source SHA, and a local UTC release tag all match. Only then may it push
the tag and publish a GitHub Release containing the final checksummed record and
sanitized summary. The final record is regenerated after Production smoke and
uses the approver from the GitHub Environment approval audit.

Any post-promotion failure invokes the checksum-bound web-only rollback and
marks the GitHub deployment failed. Database reset/down, fixture creation,
login, down migrations, or data rollback are forbidden in both workflows.
