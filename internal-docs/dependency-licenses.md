# Dependency licenses

Dependencies must use a permissive license allowed by the repository's agent
instructions. Check the package license before adding or recommending a dependency.

## Approved exception: axe-core

The maintainer approved retaining the existing axe-core scanner on 2026-10-01
in Bead `a11lied-j24.21`. The lockfile records axe-core 4.13.0 under MPL-2.0.
This exception applies only to axe-core and its existing use for accessibility scans
and WCAG rule metadata. It does not permit other MPL dependencies.

Keep the upstream license and notices in distributed packages. Before releasing,
check the installed version and license against this decision. A license change or
a modification to axe-core itself requires another maintainer review.

## Approved exceptions: existing recording and build dependencies

The maintainer approved retaining these existing dependencies on 2026-10-01 in
Bead `a11lied-j24.22`. The approval applies to the packages and uses listed below.
It does not approve unrelated GPL, LGPL, or MPL dependencies.

| Packages                                                                  | Locked versions | Licenses                                 | Existing dependency path and use                                                         |
| ------------------------------------------------------------------------- | --------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ffmpeg-static`                                                           | 5.3.0           | GPL-3.0-or-later                         | `@a11ied/core` -> `@guidepup/record` 0.1.0 -> `ffmpeg-static`; Windows desktop recording |
| `@img/sharp-libvips-*`                                                    | 1.3.3           | LGPL-3.0-or-later                        | `@a11ied/docs` -> Astro 7.3.1 -> Sharp 0.35.4; docs image processing                     |
| `@img/sharp-wasm32`                                                       | 0.35.4          | Apache-2.0 AND LGPL-3.0-or-later AND MIT | Sharp's optional WebAssembly image-processing binary                                     |
| `@img/sharp-win32-arm64`, `@img/sharp-win32-ia32`, `@img/sharp-win32-x64` | 0.35.4          | Apache-2.0 AND LGPL-3.0-or-later         | Sharp's optional Windows image-processing binaries                                       |
| `lightningcss`, `lightningcss-*`                                          | 1.33.0          | MPL-2.0                                  | Astro and Vitest -> Vite 8.2.2 -> Lightning CSS; docs and test builds                    |

The `@img/sharp-libvips-*` exception covers the Darwin, Linux, and Linux musl
packages recorded in `package-lock.json`. The `lightningcss-*` exception covers
the platform packages recorded there. Sharp itself uses Apache-2.0; the LGPL
exception concerns its bundled image-processing binaries.

## Release checks for approved exceptions

1. Compare the release lockfile's versions, licenses, and dependency paths with
   these approvals. Request another review for any change to the version, license,
   dependency path, package set, use, or distribution. Platform package additions
   within the listed families also require review.
2. Preserve upstream license and copyright notices in packages and redistributed
   binaries. For a redistributed FFmpeg binary, verify that its exact corresponding
   source is available through a distribution method that satisfies its GPL terms.
   Notices or source links alone do not establish that requirement.
3. Preserve libvips notices, source information, and the applicable replacement
   or relinking instructions when redistributing Sharp's LGPL binaries.
4. Keep MPL notices and any required covered-file source available when
   redistributing axe-core or Lightning CSS. Review modifications to those
   dependencies separately.
5. Check packed CLI dependencies separately from docs build dependencies. A
   successful CLI install does not verify notices for a bundled desktop release.
