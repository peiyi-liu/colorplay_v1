# WB5 protected merge provenance

Bounded M under the approved whole-site WB5. Existing implementer only; Root remains sole reviewer, one round. Preserve original dirty checkout, all Local data/evidence and other edits. No agents, network, browser, services, credentials, Hosted operations, workflow changes or new execution entry point.

## Problem and scope

The actual staging workflow triggers on push to staging and checks out github.sha. Owner approval separately binds the exact open PR head. A normal protected merge creates a different commit even when its complete tree equals the Local-tested head. The current pure Hosted parser rejects that legitimate relationship. Keep every Local receipt's original revision and hashes; never relabel it, bypass Local chains or repeat a full matrix merely for a verified merge identity.

Worker owns only:

- scripts/concurrency/hosted-config.ts
- scripts/concurrency/hosted-provenance.ts
- tests/contracts/whole-site-hosted-config.test.ts
- tests/contracts/whole-site-hosted-provenance.test.ts
- tests/contracts/helpers/whole-site-hosted-config.ts

Keep every file below 500 lines. Extract the existing synthetic setup verbatim to the helper if needed. Existing same-SHA behavior and all 84 controls remain; callers without merge proof cannot authorize a different candidate. No Local guard or workflow changes.

## Approved contract

Use explicit SAME_SHA and VERIFIED_PROTECTED_MERGE paths. The approval pins the provenance kind and proof SHA; a separate trusted input supplies actual proof bytes and an independently approved expected SHA. Recompute the bytes hash, parse strict bounded schemas, reject extra fields and all inconsistent relations. Missing merge proof never falls back to same-tree acceptance.

The merge proof binds fixed peiyi-liu/colorplay_v1 repository and staging branch; original Local candidate/tree and complete predecessor hashes; actual merge revision/tree and exactly two ordered parents; exact approved base, PR number/head/base; owner-approval workflow run/head and evidence SHA; branch-protection evidence SHA; Root verifier source SHA-256 and checked-at time. It also binds exact Staging target, source/web SHA, artifact and key fingerprints, and Edge-source/migration manifest hashes. Independently observed deployment manifest hashes must be compared with the proof, not accepted solely from request fields. Proof verification time must lie within the owner window and not in the future.

Require Local candidate = predecessor candidate = PR head = second parent; merge = scope source = web revision; first parent = approved PR base; both entire tree OIDs equal. Merge and Local revisions differ; parents are distinct. Wrong target, tree, parents/order, head, owner approval, manifests, fingerprints, predecessor or proof bytes deny. Squash/rebase/octopus merges and any differing tree are unsupported and deny. No ignored paths, doc exceptions or product-only tree comparison.

The pure parser validates a Root attestation's integrity and consistency. It does not independently prove remote GitHub facts, protected merge status, branch protection, artifact bytes, Edge sources or migration state. Root must obtain and verify those real facts in the later operator. Opaque evidence hashes are references, not claims of cryptographic provenance. Returned authority remains NONE; freshness, complete Local-chain verification and one-shot reservation remain Root responsibilities. No actual protected merge exists in this task.

## Validation and handback

Actual-export RED then GREEN for a valid synthetic merge, preserved original Local SHA/hash outputs, every mismatch family above, missing/forged proof, unknown fields/self-approved booleans, and same-tree-only denial. Existing 84 controls plus affected Local negative guards remain green. Import/reject performs zero IO. Run full lint/typecheck/format and affected tests; stage exact paths only and deliver a private .git packet with source/log hashes, RED/GREEN results and line counts. Root reviews Standards/Spec/Security once. This is a parser correction, not Local capacity, Hosted execution or acceptance PASS.
