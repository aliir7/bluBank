# blubank

A pnpm + [Turborepo](https://turborepo.dev) monorepo with three apps. Each app owns its TypeScript and ESLint config.

| App             | Stack                       | Dev URL               |
| --------------- | --------------------------- | --------------------- |
| `apps/frontend` | Next.js 16 (App Router, TS) | http://localhost:3000 |
| `apps/admin`    | React 19 + Vite 8 (TS)      | http://localhost:5173 |
| `apps/backend`  | NestJS 12 (TS, ESM)         | http://localhost:4000 |

`pnpm start` serves production builds on the same ports, except admin, which previews on **4173**.

## Repository layout

```
blubank/
├─ apps/
│  ├─ frontend/                Next.js — create-next-app
│  ├─ admin/                   React + Vite — create-vite (react-ts)
│  └─ backend/                 NestJS — @nestjs/cli (Vitest for tests)
├─ .husky/                     git hooks (lint-staged, commitlint)
├─ .vscode/                    shared editor settings and recommended extensions
├─ turbo.json                  task pipeline
├─ pnpm-workspace.yaml         workspaces, version catalog, pnpm settings
├─ prettier.config.mjs         single Prettier config for the whole repo
├─ lint-staged.config.mjs      pre-commit checks on staged files
└─ commitlint.config.mjs       Conventional Commits
```

## Prerequisites

- **Node.js 24 LTS** (≥ 24.15). The repo pins the major version in `.nvmrc`, so run `nvm use` (or `fnm use`).
- **pnpm 12**, managed by Corepack. The exact version is pinned in `package.json` (`packageManager` / `devEngines`).

```sh
nvm use
corepack enable pnpm
```

## Quick start

```sh
pnpm install
pnpm dev
```

Each app ships a `.env.example`. Copy it to `.env.local` (frontend, admin) or `.env` (backend) only if you need to override something. Nothing is required to boot.

## Scripts

Run these from the repository root. Each one goes through Turborepo, which caches the results and runs tasks in parallel.

| Script              | What it does                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `pnpm dev`          | Starts all three apps in watch mode.                                                           |
| `pnpm dev:frontend` | Starts only the frontend (`turbo run dev --filter=frontend`). Also `dev:admin`, `dev:backend`. |
| `pnpm build`        | Production build of every app (`.next/`, `dist/`). Cached.                                     |
| `pnpm start`        | Builds if needed, then serves the production builds.                                           |
| `pnpm lint`         | ESLint with zero warnings allowed. Cached.                                                     |
| `pnpm lint:fix`     | ESLint with `--fix`. Never cached, because it rewrites files.                                  |
| `pnpm typecheck`    | `tsc` in every app (frontend runs `next typegen` first). Cached.                               |
| `pnpm test`         | Unit tests (Vitest in backend; frontend and admin have no suite yet and exit 0). Cached.       |
| `pnpm format`       | Prettier `--write` over the whole repo.                                                        |
| `pnpm format:check` | Prettier `--check` over the whole repo, for CI.                                                |
| `pnpm clean`        | Removes build output and Turborepo caches.                                                     |

Narrow any Turborepo task with filters. For example, `pnpm build --filter=admin` builds only admin, and `pnpm lint --filter=...[origin/main]` lints only the packages changed since `main`.

Each app also keeps its own CLI scripts. For example, run `pnpm --filter backend test:e2e` or `pnpm --filter backend test:cov`.

## How the configs work

There are no shared config packages. Each app keeps its full TypeScript and ESLint config in its own directory.

- **TypeScript.** Every app's tsconfig sets the same strict baseline: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax` and related flags. On top of that:
  - frontend (`tsconfig.json`) uses bundler resolution plus the Next.js plugin.
  - admin (`tsconfig.app.json`) uses bundler resolution with `erasableSyntaxOnly`. `tsconfig.node.json` covers `vite.config.ts`.
  - backend (`tsconfig.json`) uses `nodenext` with decorators and decorator metadata. It turns off `verbatimModuleSyntax`, because Nest's dependency injection needs constructor parameter types to exist as runtime imports.
- **ESLint.** Every app has a self-contained `eslint.config.js` with `tsconfigRootDir` set to its own directory.
  - Every config includes type-aware `typescript-eslint` (strict + stylistic), `eslint-plugin-turbo`, `simple-import-sort`, and `eslint-config-prettier` last, so ESLint never fights Prettier.
  - frontend adds `@next/eslint-plugin-next`, React Hooks and React Refresh.
  - admin adds React Hooks and React Refresh.
  - backend allows decorated empty classes and does not force `import type`, to protect dependency injection.
  - Each app lists the ESLint plugins it uses in its own `devDependencies`.
- **Prettier.** One `prettier.config.mjs` and one `.prettierignore` at the root. Prettier always runs from the root, so every app uses the same settings.
- **Versions.** Dependency versions shared by several apps (TypeScript, ESLint and its plugins, React, `@types/*`, rimraf) live in the `catalog:` section of `pnpm-workspace.yaml`. Apps reference them as `"catalog:"`. To upgrade, change the version in one place.

## Turborepo pipeline

- `build` depends on `^build`. Its outputs are `.next/**` (excluding `.next/cache` and `.next/dev`) and `dist/**`.
- `lint`, `typecheck` and `test` have no task dependencies, so they run fully in parallel.
- Each app's `.env*` files are part of the `build` and `test` hashes, so changing an env value invalidates the cache. Variables prefixed `NEXT_PUBLIC_*` and `VITE_*` are hashed automatically through framework inference. `NODE_ENV` is a global env var. Declare any new env var a task reads in `turbo.json` (`env`, or `passThroughEnv` for runtime-only values). Otherwise strict env mode hides it from the task, and the `turbo/no-undeclared-env-vars` lint rule flags it.
- `dev`, `start`, `clean`, `lint:fix` and `format` are never cached.

## Git hooks

- **pre-commit**: `lint-staged` runs `eslint --fix` on staged app sources, using each app's own config, then `prettier --write` on all staged files.
- **commit-msg**: `commitlint` enforces [Conventional Commits](https://www.conventionalcommits.org), for example `feat(admin): add user table` or `fix(backend): handle empty body`.

The hooks are installed automatically by the `prepare` script during `pnpm install`.

## Adding a new app

1. Scaffold it inside `apps/` with the framework's official CLI. Use a short package name, skip git init and skip install.
2. Remove anything the monorepo already provides: a nested lockfile, `.git`, `pnpm-workspace.yaml`, the `packageManager` field, and per-app Prettier/ESLint/`.gitignore` files.
3. Use `catalog:` for shared dependencies, including the ESLint plugins.
4. Write the app's own tsconfig and `eslint.config.js`, starting from the closest existing app.
5. Provide the standard scripts: `dev`, `build`, `start`, `lint`, `lint:fix`, `typecheck`, `test`, `clean`. Pin the dev port in config, and add `.env.example`.
6. If the build writes somewhere other than `.next/` or `dist/`, add that path to `build.outputs` in `turbo.json`.
7. Run `pnpm install`, then `pnpm lint typecheck test build`.
