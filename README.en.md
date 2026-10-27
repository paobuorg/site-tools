# RunMap Tools · site-tools

[中文](README.md) · English

The site project for `tools.paobu.org`: pace, splits, run-walk, race prediction, track view and conversion/simplification, and route-field comparison. Tool documentation and contracts come from `running-tools`, shared layouts and geodesic helpers from `@paobu/core`, and the calculation and file-handling code lives here.

## Status

- Eight tools, bilingual documentation and twenty cases are implemented; the local static build passes its checks. This is not a deployed site. All six public repositories have been pushed to GitHub; Pages and DNS are not enabled.
- All eight tools were **AI-assisted editorially reviewed** and published on 2026-10-27; each has bilingual `approve` records and matching contentDigests. The reviewer is explicitly labelled AI-assisted, not independent professional review; limitations are in [ai-review-report.md](../site-www/evidence/2026-10-27/review/ai-review-report.md).
- Route comparison reads published routes only. Sixteen routes are currently published, so the page has real selectable records.
- Local release preparation exists: production builds emit `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml`, `release-manifest.json`, the PWA manifest, `sw.js` and an offline page. `.github/workflows/pages.yml` is defined. Pages is not enabled; the bootstrap run failed for that reason, was removed, and Actions is paused. Production shows 8 tools and `pnpm check:production` passes.
- The T12 slow hint, 30s timeout and cancel state pass in `site-www` via `pnpm qa:track`; the check uses a hanging Worker and shortened timers, not a physical low-end device.

## Technical baseline

- Node.js `>=22.23.4 <25`, pnpm 10.18.3, Astro 7.4.2, TypeScript 5.9.3.
- `output: 'static'` with directory-style trailing slashes; canonical origin `https://tools.paobu.org`.
- No backend is needed for calculation: arithmetic runs in client functions; GPX/GeoJSON parsing, geodesic distance and simplification run in Web Workers.
- `fast-xml-parser` 5.11.2, Pagefind 1.5.2.
- `@paobu/core` 0.2.13, installed from `vendor/paobu-core.tgz`; `core.lock.json` records artifact SHA-256 `b3e5b077614b661c0c553ef1b600386d9a946bef83a458afd0c0889f7a1efb03`.

## Tools and code locations

| Tool | Main implementation |
|---|---|
| Pace `pace` | `src/lib/calculators.ts`, three modes and unit conversion |
| Splits `splits` | `src/lib/calculators.ts`, even/negative splits and largest-remainder allocation |
| Run-walk `run-walk` | `src/lib/calculators.ts`, cycle and duration scheduling |
| Race prediction `race-predict` | `src/lib/calculators.ts`, Riegel 1.06 over 5000–42195 m |
| Track view `track-view` | `src/lib/parse-track.ts`, `src/lib/track.ts`, `src/workers/track.worker.ts` |
| Format conversion `track-convert` | `src/lib/parse-track.ts`, `src/lib/serialize-track.ts`, `src/workers/transform.worker.ts` |
| Track simplification `track-simplify` | `src/lib/simplify-track.ts`, `src/workers/transform.worker.ts` |
| Route comparison `route-compare` | `src/lib/route-compare.ts`, published route fields only |

`src/client/calculators.ts` owns forms, errors, progress, cancellation, downloads and route-comparison rendering. `src/pages/[locale]/tools/[slug].astro` owns page structure and bilingual copy. Formula descriptions, assumptions, rounding and cases live in the content repository and are not duplicated here.

## Local use

The six projects should sit in the same parent directory. The shared core is packed by `site-www`; this repository only syncs and installs the artifact:

```bash
# Requires site-www to have produced core-dist/paobu-core-<version>.tgz
cd site-tools
pnpm core:sync
pnpm install
pnpm test
pnpm test:content
pnpm check
pnpm build
pnpm dev
```

- Development: `http://localhost:4323`, with `/zh-CN/` and `/en/` entry points.
- Built preview: `pnpm preview`, `http://localhost:4423`. Cross-site links are baked from the `.env` that is actually loaded (currently the development ports), so following them locally also needs those sites running; a production build must explicitly override all three origins, otherwise localhost values enter the HTML.
- Unit tests: `pnpm test` (`tsx --test tests/*.ts`).
- Content validation: `pnpm test:content`.
- Type and Astro checks: `pnpm check`.
- Build: `pnpm build` runs the Astro static build and then Pagefind.
- Production mode: `PREVIEW_UNREVIEWED=0 pnpm build` emits the release files; `pnpm check:production` currently passes with all eight tools published.

Core upgrade: run `pnpm core:pack` in `site-www`, then `pnpm core:sync && pnpm install --force` here, and confirm that `core.lock.json` matches the installed version. Do not switch to `workspace:*` and do not copy `packages/core` source.

Content directories can be relocated with `PAOBU_REPOS_DIR`, or overridden with `TOOLS_CONTENT_DIR`. A production build must have `PREVIEW_UNREVIEWED=0` or unset in the environment file that is actually loaded. The local `.env` currently sets `1`; change or remove it before release.

## Browser boundaries

- Track files are read locally. They are not uploaded, written to analytics logs or committed.
- One file may contain at most 20,000,000 bytes and 200,000 points. Larger input is rejected rather than truncated.
- Parsing and geometry work run in a Worker. After 10 seconds the interface offers cancellation; after 30 seconds the job is terminated and no incomplete download is offered.
- DTDs, external entities, non-line geometry, invalid coordinates and non-finite numbers are rejected.
- Conversion re-serializes geometry and strips timestamps, device and personal metadata. Missing elevation stays missing.
- Simplification runs per segment and never joins segments. Tolerance is measured in a local projected plane; the resulting WGS84 distance change is reported separately.
- Route comparison uses published routes only, shows missing fields as unknown and produces no safety, difficulty or suitability ranking.

## Content locks

From the handoff root:

```bash
node scripts/content-lock.mjs          # regenerate content.lock.json for all three sites
node scripts/content-lock.mjs --verify # check that the content trees are unchanged
```

The `sha256-tree-v1` lock covers `content/`, `data/` and `assets/` in all three content repositories. There are no Git commits yet, so each lock records `commit: null`; replace it with a pinned full SHA once commits and remotes exist. The lock supports reproducible local builds and does not replace version control.

## External configuration and release boundary

- The tools work locally in the browser and need no server runtime, database or third-party calculation API.
- Cross-site links use `PUBLIC_ROUTES_ORIGIN`, `PUBLIC_KNOWLEDGE_ORIGIN` and `PUBLIC_TOOLS_ORIGIN`; production defaults live in the core and the local `.env` points to the three local ports.
- The GitHub owner, repository access, DNS and Pages settings are not available, so no workflow or deployment was created. Do not describe the local build as a live site.

## Licence

- Site code: MIT.
- Tool documentation and cases: under the `running-tools` repository licence; new documentation is CC BY 4.0.
- Formula sources, standards and papers keep their own terms and are cited from their source pages.

Last checked: 2026-10-27.
