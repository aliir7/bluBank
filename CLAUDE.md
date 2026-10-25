# CLAUDE.md

Guidance for AI coding sessions in this repository. See `README.md` for the human-facing overview.

## Rules

Only the project owner adds rules to this section. Don't invent new ones.

### Commits

- **One prompt → one review → one commit.** Each prompt results in exactly one commit. Never split a prompt's work into several commits.
- Commit messages follow Conventional Commits (enforced by commitlint).
- No `Co-Authored-By` trailer in commit messages.

### Code

- No `any`, no `@ts-ignore`, no deprecated APIs or flags, and no TODO placeholders.
- Never loosen strictness to silence an error. Fix the root cause.
- Every app has the same script names: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `clean`. An app without tests must still exit successfully on `test`.
- Don't create a shared UI package (`@repo/ui`). frontend and admin have different component sets.
- Each app's `.env.example` contains only what is needed to boot. Don't add env-validation code unless asked.
- Use the latest stable versions. Check them with `pnpm view <pkg> version` and CLI flags with `--help`, not from memory.

### Turborepo

- Follow the Turborepo skill in `.claude/skills/turborepo/`. It reads the docs bundled with the installed `turbo` (`node_modules/turbo/docs/README.md`). If the skill conflicts with a prompt, the skill wins, and the conflict must be reported.

### Definition of done

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass with zero errors and zero warnings, and running `pnpm build` a second time reports `FULL TURBO`.

## Repository facts

- pnpm 12 workspaces + Turborepo 2. The apps are `frontend` (Next.js 16, port 3000), `admin` (Vite 8 + React 19, port 5173) and `backend` (NestJS 12, port 4000). There is no `packages/` directory. Each app keeps its own tsconfig and `eslint.config.js`.
- Node 24 LTS (`.nvmrc`, `engines.node >=24.15`). The pnpm version is pinned through `packageManager` and `devEngines`.
- Shared dependency versions live in the `catalog:` section of `pnpm-workspace.yaml`.
- pnpm 12 reads its settings from `pnpm-workspace.yaml`, not `.npmrc`. A dependency with a build script must be listed under `allowBuilds`, or the install fails.
- Turborepo runs in strict env mode, so a variable a task reads must be declared in `turbo.json` (`env` or `passThroughEnv`). Each app's `.env*` files are part of its `build` and `test` hashes.
- Prettier uses the root `prettier.config.mjs` and `.prettierignore`, and is run from the root.
- `apps/frontend/AGENTS.md` is managed by `next dev`. The Next.js docs are in `apps/frontend/node_modules/next/dist/docs/`.
- The backend is ESM (`module: nodenext`), so relative imports use a `.js` suffix. Nest dependency injection relies on `emitDecoratorMetadata`, so an injected class must not be imported with `import type`. That is why the backend's tsconfig disables `verbatimModuleSyntax` and its ESLint config disables `consistent-type-imports`.
- The backend's tests use Vitest: `*.spec.ts` for unit tests, and `test/*.e2e-spec.ts` run with `pnpm --filter backend test:e2e`.
