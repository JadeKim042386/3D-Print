# AGENTS.md — 3D-Print monorepo (Paperclip `_default` workspace)

> **STANDING DIRECTIVE (CEO 2026-05-02, DPR-95 / DPR-179):**
> The `homefix-web.vercel.app` production frontend deploys from the standalone
> repo **`https://github.com/JadeKim042386/homefix.git`** — NOT from this
> `JadeKim042386/3D-Print` monorepo. The `/src/app/homefix/*` subtree in this
> repo is a stale mirror; commits here **do not reach prod**.

## If your task is a HomeFix change

Stop. Do not edit anything under this repo's `src/app/homefix/`,
`src/components/Furniture*`, `src/components/Room*`, or related homefix paths.

Switch to the homefix Paperclip workspace:

```
cd /Users/joo/.paperclip/instances/default/projects/dd04157d-4d28-46ff-826c-c3470e82efb0/ac05affd-65ec-4fa5-8bc4-d6a75a4d552d/homefix
```

That checkout is `JadeKim042386/homefix.git`. Vercel `homefix-web` auto-builds
from its `main`. Path mapping when porting a fix that landed here by mistake:

| 3D-Print (this repo)                        | homefix.git (prod source)                |
|---------------------------------------------|------------------------------------------|
| `src/app/homefix/setup/page.tsx`            | `src/app/setup/page.tsx`                 |
| `src/app/homefix/planner/[id]/page.tsx`     | `src/app/planner/[id]/page.tsx`          |
| `src/components/FurniturePlacer.tsx`        | inline in `src/app/planner/[id]/page.tsx` |

A pre-commit hook in this repo (`scripts/git-hooks/pre-commit`, installed via
`core.hooksPath`) blocks commits that touch homefix-shaped paths
(`src/app/homefix/**`, `src/components/FurniturePlacer*`,
`src/components/Room{Layout,Setup}Editor*`, `src/lib/homefix/**`,
`public/homefix/**`). If the hook fires, port the change to the standalone
homefix repo and commit there instead.

If you cloned fresh and the hook is not active, install once:

```
git config core.hooksPath scripts/git-hooks
```

Override (only when you intentionally need to commit one of these paths to
3D-Print, e.g. ripping out the stale subtree):
`ALLOW_HOMEFIX_COMMIT=1 git commit …`

## Verifying a homefix deploy

After pushing to `homefix.git main`:

1. `curl -sI https://homefix-web.vercel.app/ | grep -i x-vercel-id` — buildId
   prefix should change.
2. `curl -s https://homefix-web.vercel.app/_next/static/chunks/app/setup/page-*.js | grep -oE 'https?://[a-z0-9.-]+\.fly\.dev'`
   — must show `homefix-api-prod.fly.dev`.

Reference: [DPR-95](/DPR/issues/DPR-95) comment `fe999d5d` (CEO directive),
[DPR-179](/DPR/issues/DPR-179) (this trap, permanent fix).
