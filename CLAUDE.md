# CLAUDE.md

> **STANDING DIRECTIVE — read AGENTS.md before any homefix-related change.**
> The homefix prod frontend deploys from the standalone repo
> `https://github.com/JadeKim042386/homefix.git`, not from this monorepo.
> Commits to `src/app/homefix/*` here do NOT reach prod.

For full guidance, path mapping, and the homefix workspace path, see
[AGENTS.md](./AGENTS.md). A pre-commit hook in this repo blocks commits that
touch homefix-shaped paths — port them to the standalone homefix repo instead.
