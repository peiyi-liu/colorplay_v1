# Release incident and web rollback

Environment monitoring is strictly read-only. It renders PRESS START and Login,
checks assets and the environment marker, records console/required-network error
counts, and blocks every browser request except GET/HEAD. It never signs in,
submits a form, uses a fixture identity, or calls a mutation endpoint.

The scheduled monitor runs Staging and Production every 30 minutes and stores
only secret-scanned JSON for 30 days. Incidents deduplicate by environment and
failure class.

## Rollback boundary

One or two observations do not move the Production alias. Three consecutive
critical web-render, asset, routing, or availability failures may invoke
`rollback-web.sh` only after:

1. the release record checksum verifies;
2. the observed current deployment ID exactly matches the record;
3. the previous healthy deployment ID comes from that verified record.

Rollback changes only the web artifact. Security, authorization, suspected data
corruption, incompatible schema, or uncertain current deployment enters manual
incident recovery and must not run automated rollback. After rollback, keep the
failed release record and monitoring evidence; do not alter database history.
