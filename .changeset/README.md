# Changesets

Each file in this folder is one entry for the next release's changelog. Run
`npx changeset` to add one in any pull request that changes what users get.

## Which package to pick

Every published package shares one version, so the package you pick only decides whose
changelog the entry appears in. Pick the package the reader installs:

- `a11ied` for the `a1` CLI, the MCP server, the test API, and the Agent Skills, even
  when the code changed in an internal package such as `@a11ied/core` or
  `@a11ied/guidepup`
- `@a11ied/compat` for the compatibility API
- `@a11ied/support-data` for the recorded test cases and results

Internal packages are left out of the GitHub release notes, so an entry written only for
one of them is not seen.

## Which bump to pick

Until 1.0, `minor` is for a new feature or a change that breaks existing use, and `patch`
is for a fix. Changes nobody using the packages would notice, such as tests, CI, docs, or
refactoring, need no changeset.

## How to write the entry

Write for someone who uses a11ied and did not see the pull request. Say what they can do
now, or what works differently, in a sentence or two. Name the command, option, or export.

- Good: "`a1 sr type` now reaches the page on Windows. NVDA sessions typed into a console
  window that opened in front of the browser."
- Not useful: "Fix cscript spawning in guidepup adapter."

## What happens next

On each push to `master`, the release workflow keeps a "chore: version packages" pull
request open with the new version and changelogs. Merging that pull request publishes
every package to npm and creates one GitHub release with the notes for `a11ied`,
`@a11ied/compat`, and `@a11ied/support-data`.
