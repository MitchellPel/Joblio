# Contributing to Joblio

Thanks for wanting to help. Joblio is a **Windows desktop** app (Electron + React). People use it on shop laptops without a dedicated GPU. Small, careful changes beat a redesign.

## Before you start

- **Windows 10/11** and **Node.js 20+**
- Open an [issue](https://github.com/MitchellPel/Joblio/issues) for anything larger than a typo or an obvious bugfix
- Do not commit secrets, `.env`, `jobs.db`, proofs, or anything from `Reference Program/` (AGPL — learning only, never copy into Joblio)

## Run it

```bash
npm install
npm run dev
```

On first launch choose **Start on this PC**. Login `admin` / `admin123`.

`npm run lint` typechecks the Electron main process and the UI.

## How we like PRs

- One problem per PR
- Keep the UI change as small as the fix — do not restyle the whole app
- Prefer contrast and layout that still work when the window is small
- Do not add a web server, cloud host, or “open this URL in a browser” as the way to use Joblio
- Shop auto-update stays on the office share; public copies skip that share if it is missing

## Where code lives

| You want to… | Start here |
|--------------|------------|
| Screen / layout | `src/pages/`, `src/components/` |
| Window, SQLite, files | `electron/` |
| IPC used by the UI | `electron/preload.ts` + `src/electron-api.d.ts` |
| Schema | `electron/db/migrate.ts` then `electron/repositories/` |
| Stages / colours | `src/data/stages.ts` |
| Release notes in the app | `src/data/changelog.ts` |

Adding a table: migration → repository → IPC → preload → types → UI.

## Ideas we would love

- Bugs you hit after **Start on this PC** (no office network)
- Dark / light contrast, empty states, error copy
- Docs that make the first 10 minutes obvious
- Tests that cover login, board, setup, and proofs without needing the shop share

## License

By opening a pull request you agree your contribution is under the [Apache License 2.0](LICENSE), unless you say otherwise in the PR.
