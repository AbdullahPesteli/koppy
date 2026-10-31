# Koppy Release Plan (K02) — PLAN, NOT EXECUTED

Status: **release_not_published**. Nothing below has been run. No push, merge, tag, branch creation, force or history rewrite was performed by K02. `origin` data is the **local snapshot** of `refs/remotes/origin/*` (no fetch was made); GitHub state may differ.

## 1. Branch graph evidence (local, read-only)

| Question | Source command | Result |
|---|---|---|
| master commit count / roots | `git rev-list --count master`; `git rev-list --max-parents=0 master` | 1 commit, root `4b41f31` ("Initial commit") → single-rooted **orphan** |
| origin/master (snapshot) | `git rev-list --count origin/master`; `--max-parents=0` | 36 commits, tip `8181720`, root `1822ab1` |
| merge-base master origin/master | `git merge-base master origin/master` | **rc=1** (no common ancestor) |
| public-clean | `git rev-list --count public-clean`; root | 37 commits, tip `0137d15`, root `1822ab1` |
| origin/master ancestor of public-clean | `git merge-base --is-ancestor origin/master public-clean` | **rc=0** (yes) |
| local recent commits | `git log --oneline -3` | K02 patch commits on top of `0137d15` |

Consequence: `master` (orphan, 1 commit) shares no history with `origin/master`/`public-clean`. Publishing from `master` would lose/ignore the 37-commit history. The release line must descend from `public-clean`.

## 2. Decisions

- Single release branch: **`release`**, created in the future from `public-clean` (history preserved). Not created by this card.
- `package.json` is the only version authority. Target: **0.7.0**.
- Build injects the version into the `@version` metadata and the bridge `SCRIPT_VERSION` (source holds the placeholder `__KOPPY_VERSION__`).
- `@updateURL`/`@downloadURL` → `https://raw.githubusercontent.com/AbdullahPesteli/koppy/release/dist/Koppy.user.js`. **Not live** until step 6; do not treat as distributed.
- Tag contract: tag `v<package.version>` must point exactly at the release candidate HEAD. Older/unrelated tags never satisfy the check.

## 3. Eight ordered release steps (plan only)

| # | Step | Verification command |
|---|---|---|
| 1 | Freeze: clean tree on the candidate (K02 commits on `koppy/k02-release-chain`), review diff. | `git status --porcelain` is empty; `npm test` rc=0 |
| 2 | Create `release` from `public-clean` lineage (no rewrite): `git branch release koppy/k02-release-chain` (after the K02 branch is reviewed/approved). | `git merge-base --is-ancestor public-clean release; echo $?` → 0 |
| 3 | On `release`, rebuild dist from source via `npm run build` (default output, `KOPPY_RELEASE_BRANCH` unset → `release`) and commit dist as its own owned change. | `node scripts/build.mjs` then `git diff --stat dist` only expected files |
| 4 | Run gate on clean tree. | `node scripts/release-check.mjs --branch release; echo $?` — all PASS except tag (rc=1 until step 5) |
| 5 | Tag the candidate HEAD: `git tag v0.7.0`. | `git tag --points-at HEAD` lists `v0.7.0`; `node scripts/release-check.mjs --branch release` rc=0 |
| 6 | Publish: `git push origin release` then `git push origin v0.7.0` (plain, no force). | `git ls-remote origin refs/heads/release refs/tags/v0.7.0`; raw URL returns 200 with `@version 0.7.0` |
| 7 | Migration for existing installs (see §4): update the old `master` raw file or announce reinstall. | `curl -sI` raw `master` URL; Tampermonkey update check from a test profile |
| 8 | Post-release verification: installed userscript reports 0.7.0 and update URLs point at `release`. | `curl -s <raw release URL> \| grep -E '@(version\|updateURL\|downloadURL)'` |

### Rollback (no force, no history rewrite, no tag deletion)
- Before step 6: nothing is public; delete only the *local, unpushed* branch/tag you created (`git branch -d release`, local tag) or just abandon them.
- After step 6: do not delete tags or force-push. Fix forward: commit a revert (`git revert`) on `release`, bump to the next patch (0.7.1), re-run steps 3–6 with a new tag. Previous raw `master` file remains as-is as a fallback for old installs.

## 4. Migration of old master installs

Existing installs carry `@updateURL`/`@downloadURL` → `.../koppy/master/dist/Koppy.user.js` (raw currently frozen at 0.5.9 per K02 parent measurement). Those installs never read `release`. Migration is **required**:
1. Publish a bridging build to the old `master` raw path whose `@version` > installed and whose URLs point to `release` (needs a separate approved action, since `master` is an unrelated orphan), **or**
2. Ask users to reinstall from the `release` raw URL.
Until one is done, old installs will not receive 0.7.0.

## 5. Checker contract (`scripts/release-check.mjs`)

Fail-closed: every check prints PASS/FAIL, rc=1 on any FAIL, missing artefact/tag/errors are FAIL. Target branch: `--branch` > `KOPPY_RELEASE_BRANCH` > real current git branch. Porcelain dirty state is measured **before** rebuild; rebuild writes to `.context/tmp/rc-*` through `KOPPY_BUILD_OUT`; the checker verifies source and dist remain untouched.

## 6. Receipts (real runs, workspace worktree)

| Run | Result |
|---|---|
| Baseline `npm test` (before patch, after `npm ci`) | rc=0, 57 tests, 57 pass, 0 fail |
| Baseline checker against pre-patch artefact/tag state (checker drafted, run `--no-rebuild` before patch) | **RED rc=1**: 5 PASS / 8 FAIL (lock 0.5.9, STATUS 0.5.9, bridge hard-coded, URLs master≠branch, no tag, rebuild unverified) |
| Post-patch `npm test` | rc=0, 57 pass, 0 fail |
| Determinism: two builds via `KOPPY_BUILD_OUT` | identical sha256 `bce265ea43d8…`; `@version 0.7.0`, `SCRIPT_VERSION "0.7.0"`, URLs `release` |
| Post-patch `release-check.mjs` (clean tree, default branch) | **RED rc=1**: 7 PASS / 6 FAIL |
| Post-patch `release-check.mjs --branch release` | **RED rc=1**: 7 PASS / 6 FAIL (stale dist x4 incl. master URLs, no tag, rebuild sha) |

Separation of RED causes (post-patch, expected):
- **Single-source / rebuild mechanics: PASS** (versions aligned in package/lock/STATUS, source placeholder, deterministic rebuild).
- **Stale tracked dist** (`dist/Koppy.user.js` still 0.6.0, sha `25c8bc32…`; rebuild sha `bce265ea…`): FAIL by design — K02 may not commit dist.
- **Real release gates** (tag `v0.7.0` absent; with default branch the target is `koppy/k02-release-chain` ≠ URL branch): FAIL by design until steps 2–5 run.

No check was relaxed and no tag/branch/remote was created to pass.
