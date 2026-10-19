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

1. `node scripts/release.mjs 0.2.0` — bumps `package.json`, refreshes
   `package-lock.json` and the pinned tag in the
   [README](../README.md#install), then prints the commands below
2. `git add -A && git commit -m "Release v0.2.0"`
3. `git tag -a v0.2.0 -m "v0.2.0" && git push origin main --follow-tags`

The script stops before the git commands: the commit, the tag and the push
stay a human decision. It also reminds you to update the version in the vault
note, which lives outside this repository.

The tag runs CI, which publishes the version. The workflow refuses to publish
if the tag does not match the version in `package.json`, and `npm test` gates
every publish.
