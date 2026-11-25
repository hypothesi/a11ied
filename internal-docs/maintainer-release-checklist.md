# a11ied maintainer release checklist

This is a maintainer-facing release checklist for the monorepo. It is not part of the public docs site because it describes internal release mechanics, CI, and package publication workflow.

## Pre-release steps

1. Wait for all CI checks to pass.
2. Run a manual macOS VoiceOver smoke pass on representative fixtures or demo targets.
3. Run a manual Windows NVDA smoke pass on representative fixtures or demo targets.
4. Review deferred items and make an explicit accept-or-block decision for each.
5. Record what was exercised and any environment constraints that applied.
6. Check dependency licenses against [the dependency policy](dependency-licenses.md),
   including the approved scanner, recorder, and build exceptions and their notices.

## Required commands

```sh
npm run standards
npm test
npm run pack:check
a1 help-all
a1 doctor --json
```

## Packages

Three packages are for users: `a11ied`, `@a11ied/compat`, and `@a11ied/support-data`. The
other ten published `@a11ied/*` packages are internal. They are on npm only because
`a11ied` depends on them, and their READMEs say so. `@a11ied/docs` and
`@a11ied/act-conformance` are private and never published.

Every published package has the same version. [Changesets](https://changesets.dev) bumps
them together and writes each package's `CHANGELOG.md` from the files in `.changeset/`.
`.changeset/README.md` says which package an entry belongs to and how to write it.
Changelog entries thank their GitHub author, except for the logins in `maintainers` in
`.changeset/config.json`. Add each new maintainer there.

## Publishing

The `release` workflow (`.github/workflows/release.yml`) runs on every push to `master`.

1. While changesets are waiting, it keeps a "chore: version packages" pull request open
   with the new version and changelogs. That pull request is opened with the workflow's
   own token, so GitHub does not run CI on it; check it before merging.
2. Merging that pull request leaves a version that npm does not have yet. The workflow's
   `publish` job then runs data validation, standards, tests, and `npm run pack:check`,
   publishes every package with provenance in dependency order, and creates one GitHub
   release, `v<version>`, from the `a11ied`, `@a11ied/compat`, and `@a11ied/support-data`
   changelogs (`scripts/release-notes.mjs`).
3. A failed publish can be rerun. Packages already on npm are skipped, and the GitHub
   release is created only once.

The `publish` job holds no npm token. It uses
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers): npm checks that the
publish comes from `release.yml` in `hypothesi/a11ied`, running in the `npm` GitHub
environment, and adds a provenance statement to each version. Each of the 13 packages
needs that trusted publisher set up on npm, as described in the next section.

If a publish fails with a 404 or "not found" on `PUT`, npm did not accept the job as a
trusted publisher. Compare the package's trusted publisher with the workflow file name,
the environment name, and `repository.url` in its `package.json`.

After publishing, publish the docs from `packages/docs/dist/`, and ship
`packages/skills/a11ied/` and `packages/skills/a11ied-audit/` only after the skill text
matches the released CLI and MCP behavior.

## Setting up npm publishing

This is done once. Trusted publishing cannot create a package, and a new trusted
publisher expires unless a publish succeeds through it within 2 days. So each name is
reserved first with a placeholder version, then the trusted publishers are set up, and
then the workflow publishes the real first version.

You need an npm account with two-factor authentication, npm 11.15.0 or later, and admin
access to the GitHub repository.

1. On npmjs.com, create the `a11ied` organization, so the `@a11ied` scope is yours.

2. In the GitHub repository, open Settings, Environments, and create an environment named
   `npm`. It needs no secrets. To approve each publish by hand, add yourself as a
   required reviewer. Under deployment branches, allow only `master`.

3. Sign in with `npm login`, then reserve the 13 names with a placeholder version, from
   the repository root:

   ```sh
   names=(a11ied @a11ied/contracts @a11ied/wcag-data @a11ied/wcag-engine @a11ied/earl
      @a11ied/guidepup @a11ied/knowledge @a11ied/observe @a11ied/audit @a11ied/core
      @a11ied/mcp-server @a11ied/support-data @a11ied/compat)
   placeholders="$(mktemp -d)"
   for name in "${names[@]}"; do
      dir="${placeholders}/${name//\//__}"
      mkdir -p "$dir"
      printf '{ "name": "%s", "version": "0.0.0-placeholder", "description": "Reserved for a11ied. Install a later version.", "license": "MIT", "repository": { "type": "git", "url": "git+https://github.com/hypothesi/a11ied.git" } }\n' "$name" > "$dir/package.json"
      (cd "$dir" && npm publish --access public --tag placeholder --provenance=false)
   done
   ```

   npm asks for two-factor authentication. In the browser prompt, choose to skip it for 5
   minutes so the other packages publish without asking again.

4. Set up the trusted publisher for each package. `--allow-publish` is needed: since
   September 2026 a new trusted publisher only allows `npm stage publish` unless told
   otherwise, and the workflow runs `npm publish`.

   ```sh
   for name in "${names[@]}"; do
      npm trust github "$name" --repo hypothesi/a11ied --file release.yml --env npm --allow-publish --yes
      sleep 2
   done
   ```

   To check one: `npm trust list a11ied`. The same settings can be entered on
   npmjs.com, under the package's Settings, Trusted publishing: organization `hypothesi`,
   repository `a11ied`, workflow `release.yml`, environment `npm`, with `npm publish`
   allowed.

5. Within 2 days, push to `master`, or run the `release` workflow by hand. It publishes
   0.1.0 of every package through the trusted publishers and creates the `v0.1.0` GitHub
   release. If the environment has a required reviewer, approve the `publish` job.

6. Check the result: `npm view a11ied` shows 0.1.0 as `latest`, the package page on
   npmjs.com shows a provenance badge, and `npm audit signatures` in a project that
   installs `a11ied` reports verified attestations.

7. Close the other ways to publish. For each package on npmjs.com, open Settings,
   Publishing access, choose "Require two-factor authentication and disallow tokens", and
   save. Trusted publishing keeps working. Mark each placeholder as replaced:

   ```sh
   for name in "${names[@]}"; do
      npm deprecate "${name}@0.0.0-placeholder" "Placeholder that reserved the name. Install a later version."
   done
   ```

   Revoke any npm access tokens made for publishing a11ied.

## Known deferred items

Known problems are tracked as beads. `bd list --status open` lists them; decide for each
one whether it blocks the release.

## Manual smoke tests are required

VoiceOver and NVDA are the primary target platforms. The virtual reader is useful for fast iteration, but releases require confirmation on real assistive technology.
