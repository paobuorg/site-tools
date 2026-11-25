# RUNUP Tools · site-tools

English · [中文](README.md)

Website project for `tools.paobu.org`: pace, splits, run-walk, race prediction, fueling, carb loading, heat adjustment, grade-adjusted pace, sweat rate, training load, injury-risk self-check, shoe mileage, race checklist, track view/conversion/simplification, elevation analysis, and route comparison. Tool documentation, formulas, assumptions, and cases come from `running-handbook/tools/`; shared layouts and geodesic helpers come from `@paobu/core`; calculation and file-handling code lives here.

## Current State

- **The local repository restructure was completed on 2026-11-25.** The content source moved from the old `running-tools` to `running-handbook`, and the core moved from `site-www/packages/core` to the standalone `paobu-core` artifact.
- The content gate passes: **18 tool entities**, **43 tool cases**, **959 sources** (shared three-site gate scope), and **5,389 claims**.
- Local production build: **43** static HTML pages, **40** hosting pages, **36** Pagefind records, and **40** sitemap URLs. `check:production` passes (tool=18).
- Local QA passes: 360-page crawl, Chromium UI matrix, performance budgets, 8 fault checks, 11 track checks, 11 cross-site checks, and 18 PWA checks.
- **The live `https://tools.paobu.org/` is still the 2026-10-29 build.** Nothing was pushed in this round; Pages deployment and live acceptance are not complete.
- Shared core `@paobu/core@0.3.0`, artifact SHA-256 `e30e89f289ca7c4fab2a0941d6967c081af54b63741559651c2cdf6ec4a0d16e`.

## Technical Baseline

- Node.js `>=22.23.4 <25`, pnpm 10.18.3, Astro 7.4.2, TypeScript 5.9.3.
- `output: 'static'`, trailing-slash directory output, canonical origin `https://tools.paobu.org`.
- Calculation is client-side: pure arithmetic runs in client functions; GPX/GeoJSON parsing, geodesic distance, and simplification run in Web Workers.
- `fast-xml-parser` 5.11.2, Pagefind 1.5.2.
- `@paobu/core` 0.3.0 from `vendor/paobu-core.tgz`; `core.lock.json` records the same SHA-256.

## Tools and Code Locations

| Tool | Main implementation |
|---|---|
| Pace `pace` | `src/lib/calculators.ts`, three modes and unit conversion |
| Splits `splits` | `src/lib/calculators.ts`, even/negative splits and largest-remainder allocation |
| Run-walk `run-walk` | `src/lib/calculators.ts`, cycle and total-duration scheduling |
| Race prediction `race-predict` | `src/lib/calculators.ts`, Riegel 1.06, 5000–42195 m |
| Fueling `fueling-planner` | `src/lib/fueling.ts`, hourly 30–60 g range and product servings |
| Carb loading `carb-load-planner` | `src/lib/carb-load-planner.ts`, body-weight and day-based estimate |
| Heat adjustment `heat-adjust` | `src/lib/heat-adjust.ts`, temperature and humidity adjustment |
| Grade-adjusted pace `grade-adjusted-pace` | `src/lib/grade-adjusted-pace.ts`, grade conversion |
| Sweat rate `sweat-rate` | `src/lib/sweat-rate.ts`, weight change and fluid replacement |
| Training load `training-load` | `src/lib/training-load.ts`, duration and intensity factor |
| Injury-risk self-check `injury-risk-check` | `src/lib/injury-risk-check.ts`, questionnaire-style risk notice |
| Shoe mileage `shoe-mileage` | `src/lib/shoe-mileage.ts`, starting mileage, cumulative mileage, user threshold |
| Race checklist `race-checklist` | `src/lib/race-checklist.ts`, weather, terrain, duration, and travel conditions |
| Track view `track-view` | `src/lib/parse-track.ts`, `src/lib/track.ts`, `src/workers/track.worker.ts` |
| Track conversion `track-convert` | `src/lib/parse-track.ts`, `src/lib/serialize-track.ts`, `src/workers/transform.worker.ts` |
| Track simplification `track-simplify` | `src/lib/simplify-track.ts`, `src/workers/transform.worker.ts` |
| Elevation `route-elevation` | `src/lib/elevation.ts`, `src/workers/elevation.worker.ts`, cumulative gain/loss and grade |
| Route comparison `route-compare` | `src/lib/route-compare.ts`, reads published route fields only |

`src/client/` handles forms, error messages, progress, cancellation, downloads, and result rendering; `src/pages/[...locale]/tools/[slug].astro` handles tool-page structure and bilingual copy. Formula descriptions, assumptions, rounding, and cases live in the content repository and are not duplicated here.

## Layout

```text
src/pages/                [...locale] home, tool detail, search, and 404
src/lib/                  Calculation, track parsing, serialization, simplification, elevation, route comparison
src/client/               Forms, errors, progress, cancellation, downloads, result rendering
src/workers/              GPX/GeoJSON parsing, transforms, and elevation workers
scripts/sync-core.mjs     Verifies and syncs the core tgz from ../paobu-core/core-dist
scripts/postbuild.mjs     Pagefind index and static output checks
vendor/paobu-core.tgz     Locked core artifact (gitignored; rebuilt by core:sync before install)
core.lock.json            Core artifact version and SHA-256
content.lock.json         Local tree lock for the two content repositories
```

## Local Run

All six projects live under one parent directory. First ensure `paobu-core` has produced `core-dist/paobu-core-0.3.0.tgz`:

```bash
cd paobu-core
node scripts/pack-core.mjs

cd ../site-tools
node scripts/sync-core.mjs
pnpm install
pnpm test:content
pnpm check
pnpm test
pnpm build
pnpm dev
```

- Development: `http://localhost:4323`.
- Preview build: `pnpm preview`, `http://localhost:4423`.
- Content validation: `pnpm test:content`.
- Type check: `pnpm check`.
- Unit tests: `pnpm test`, covering calculators, track parsing/serialization/simplification, elevation, route comparison, and tool contracts.

Production builds must set the three origins and the review switch explicitly:

```bash
PUBLIC_ROUTES_ORIGIN=https://paobu.org \
PUBLIC_KNOWLEDGE_ORIGIN=https://learn.paobu.org \
PUBLIC_TOOLS_ORIGIN=https://tools.paobu.org \
PREVIEW_UNREVIEWED=0 pnpm build
pnpm check:production
```

## Shared Core and Content Lock

Core source changes only in `paobu-core`. After `node scripts/pack-core.mjs` there, run `node scripts/sync-core.mjs && pnpm install` here. All three sites must use the same version and SHA-256; keep older tgz artifacts for rollback.

The content lock is generated by `node scripts/content-lock.mjs` at the handoff root and covers `marathon-trail-running-races` (`content/`, `data/`, `assets/`) and `running-handbook` (`knowledge/{content,data,assets}`, `tools/{content,data,assets}`). It currently pins route repo `7cc63ab7…` and handbook `1e008e39…`.

## Calculation and Privacy Scope

- All calculations run in the browser; GPX/GeoJSON files and inputs are not uploaded. Track files stay in the current session and Worker and are not written to a server.
- Results are estimates, not medical, coaching, or race-direction advice; pages show applicability, rounding, and failure boundaries.
- The injury-risk self-check does not diagnose; emergency signals require medical care.
- Preview builds may show the unreviewed banner; production builds must use `PREVIEW_UNREVIEWED=0`.
- The live site is still the old build; the new repository names have not been created under `paobuorg`, and the local credential has no push permission. Local build success must not be described as a live release.

## License

- Website code: MIT.
- Tool content: `running-handbook` repository license; newly written prose is CC BY 4.0.
- Third-party dependencies and fonts retain their own licenses.

Last reviewed: 2026-11-25.
