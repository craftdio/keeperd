# Develop and Contribute to KeepERD

[Overview](README.md) · [Setup](tools/local-erd/SETUP.md) · [Usage](tools/local-erd/README.md) · [Issues](https://github.com/craftdio/keeperd/issues)

Keep changes focused on KeepERD's Git schema Sync, ERD editing, local workspace storage, or CLI. For everyday use, [install with Homebrew](tools/local-erd/SETUP.md#install-with-homebrew).

## Run from source

Clone the repository you intend to contribute to, create a work branch from its default branch, and enter the checkout. Use the exact Node.js version in `.nvmrc` (**26.12.1** currently). Docker is needed for schema replay; GitHub inputs also need GitHub CLI authentication.

```sh
nvm install
nvm use
npm run local:init
npm run local:start
```

`local:init` installs dependencies and builds the Sync-enabled app. Use `npm run local:stop` to stop it from another terminal. `npm run dev` and `npm run build` retain the upstream editor workflow; use `npm run local:build` for KeepERD's repository Sync UI.

Homebrew users receive a private pinned Node runtime automatically. Source development uses the runtime selected in your shell. No SQLite server or PostgreSQL server installation is required; workspace storage uses built-in SQLite, and schema replay uses temporary PostgreSQL 17 containers in Docker.

## Validate a change

Run the checks relevant to the change. For application changes, the main checks are:

```sh
npm run lint
npm run test:ci
npm run local:test:cli
npm run local:build
```

`npm run local:test` runs the focused local-ERD UI and layout tests. Schema runner changes also need replay tests against the supported input and pinned images. Use synthetic schemas and a separate `KEEPERD_STATE_DIR` for tests that touch workspace data.

## Open a pull request

1. Check this repository's issues and describe the problem or intended behavior.
2. Keep the change focused and add regression coverage when behavior changes.
3. Explain the resulting behavior and relevant verification in the pull request.
4. Target this repository's default branch and address review feedback.

Report bugs, usage questions, and feature requests in [KeepERD Issues](https://github.com/craftdio/keeperd/issues). For release and formula updates, see the [setup guide's maintainer notes](tools/local-erd/SETUP.md) and [Homebrew maintainer guide](https://github.com/craftdio/homebrew-keeperd#maintainers).

## Attribution and license

KeepERD is an independent, unofficial fork of [ChartDB](https://github.com/chartdb/chartdb), with no affiliation or endorsement. Preserve upstream notices and the [GNU AGPL v3 license](LICENSE). Contributions are distributed under that license; see [NOTICE](NOTICE).
