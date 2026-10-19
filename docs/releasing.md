# Releasing

This section is part of the [pi-stats-poster README](../README.md).

Publishing uses npm's
[trusted publishing](https://docs.npmjs.com/trusted-publishers): CI
authenticates with the workflow's OIDC identity, so there is no npm token in
this repository and nothing long-lived to rotate or leak. npm generates the
provenance attestation automatically.

The trust configuration lives on the package's npm page (Packages →
pi-stats-poster → Settings → Trusted Publisher → GitHub Actions):

| Field | Value |
| --- | --- |
| Organization or user | `xprnvd` |
| Repository | `pi-stats` |
| Workflow filename | `ci.yml` |

To release:

1. bump `version` in `package.json`, then `npm install` to refresh
   `package-lock.json`
2. update the pinned tag in the Install section of the
   [README](../README.md#install)
3. commit and push
4. `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin main --follow-tags`

where `vX.Y.Z` is the version you bumped in step 1 — the workflow refuses to
publish a tag that does not match it.

The tag runs CI, which publishes the version. The workflow refuses to publish
if the tag does not match the version in `package.json`, and `npm test` gates
every publish.
