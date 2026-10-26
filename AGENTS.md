# AGENTS.md

Guidance for AI coding sessions in this repository. See `README.md` for the human-facing overview.

## Rules

Only the project owner adds rules to this section. Don't invent new ones.

### Commits

- **One prompt → one review → one commit.** Each prompt results in exactly one commit. Never split a prompt's work into several commits.
- **Never commit without the owner's review.** Leave the changes uncommitted and stop. Commit only after the project owner has reviewed them and explicitly asked for the commit.
- Commit messages follow Conventional Commits (enforced by commitlint).
- No `Co-Authored-By` trailer in commit messages.

### Code

- No `any`, no `@ts-ignore`, no deprecated APIs or flags, and no TODO placeholders.
- Never loosen strictness to silence an error. Fix the root cause.
- Every app has the same script names: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `clean`. An app without tests must still exit successfully on `test`.
- Don't create a shared UI package (`@repo/ui`). frontend and admin have different component sets.
- Write the app's setup configuration inline in `main.ts`. Don't create separate setup files such as `app.setup.ts` or `http.ts`.
- Each app's `.env.example` contains only what is needed to boot. Don't add env-validation code unless asked.
- Use the latest stable versions. Check them with `pnpm view <pkg> version` and CLI flags with `--help`, not from memory.

### Turborepo

- Follow the Turborepo skill in `.claude/skills/turborepo/`. It reads the docs bundled with the installed `turbo` (`node_modules/turbo/docs/README.md`). If the skill conflicts with a prompt, the skill wins, and the conflict must be reported.

### Definition of done

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass with zero errors and zero warnings, and running `pnpm build` a second time reports `FULL TURBO`.
- **Every task is built and run before it is reported as done.** Run `pnpm dev`, and `pnpm start` after `pnpm build`, and confirm that every app boots without errors and answers on its port: frontend on 3000, admin on 5173 (dev) and 4173 (start), and backend on 4000 (`GET /health`). Stop the processes afterwards. If any app fails to build or run, the task is not done.

<!-- ### Prompt log

- **Save every prompt before doing anything else.** At the start of each prompt, write the user's prompt verbatim to `prompts/_NN.<slug>.md`.
  - `NN` is the next number: list the file names in `prompts/` (names only, never open the files), take the highest number and add 1, zero-padded to two digits (`_03`, `_04`, …).
  - `<slug>` is a short lowercase name for the prompt's main action, letters and digits only, no spaces, dashes or dots (e.g. `writefirstadr`, `setupturbo`).
  - The file contains the exact prompt text, unchanged: no summary, no added headings, no front matter.
  - The prompt file is part of that prompt's single commit. -->

### Architecture decisions (ADR)

- **Ask before writing an ADR.** Before starting a task, check whether it makes an architectural decision: a new framework, library or tool, a change in project structure, a new pattern, how the apps communicate, infrastructure, or replacing an earlier decision. If it does, stop and ask whether to write an ADR. Don't write one without a yes.
- If the answer is yes, write only the ADR in that prompt, then stop for review. Don't implement the decision until the ADR is approved.
- ADRs go at the end of `DECISIONS.md` and are written in Persian. Package names, code and file paths stay in English.
- Follow the existing format in `DECISIONS.md` exactly:
  - Heading `## ADR-NNN: <title>`, where `NNN` is the next number (three digits).
  - **وضعیت** and **تاریخ** (today, `YYYY-MM-DD`).
  - Three sections: `### دلیل`, `### راه‌حل`, `### هزینه`, each as short bullets.
  - A `---` separator before each new ADR.
- New ADRs start as `پیشنهادی`. Only the project owner changes the status to `پذیرفته‌شده` or `ردشده`.
- Never edit an accepted ADR. To change a decision, write a new ADR and set the old one's status to `جایگزین‌شده با ADR-NNN`.

### Ignored paths

<!-- - **Never use the contents of `prompts/`.** The root `prompts/` folder is educational material only and is not part of the project.
  - Don't read, search, reference, edit, move or delete existing files in it.
  - The only allowed actions are listing file names to find the next number and creating the new prompt file (see Prompt log).
  - Its contents must never influence code, configuration, commits, plans or answers.
  - If a search or tool result includes a file from `prompts/`, skip it. -->

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
