<h3 align="center">
  <strong>KeepERD — Setup Guide</strong>
</h3>

<p align="center">
  <a href="../../README.md">Overview</a> &bull;
  <a href="#install-with-homebrew">Installation</a> &bull;
  <a href="#upgrade">Upgrade</a> &bull;
  <a href="#troubleshooting">Troubleshooting</a>
</p>

<p align="center">
  Install with Homebrew. Start KeepERD. Sync your first branch.
</p>

---

## Install with Homebrew

You need [Homebrew](https://brew.sh) and a running [Docker Desktop](https://www.docker.com/products/docker-desktop/) or another Docker-compatible runtime to reproduce schemas.

```sh
brew tap craftdio/keeperd
brew install keeperd
keeperd init
keeperd start
```

Homebrew installs the prebuilt app, Git, GitHub CLI, and KeepERD's own pinned Node.js runtime. **No source checkout, npm install, or manual Node setup is needed.** Docker is installed separately.

On macOS, KeepERD opens your default browser. Otherwise, open the address printed in your terminal (normally [http://localhost:18777/](http://localhost:18777/)).

## Sync your first branch

### GitHub repository

Sign in with an account that can access your repository:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

In KeepERD, select **account or organization → repository → branch → Sync**. If the app was already open, use its login recheck action after signing in.

### Local repository

No GitHub login is required. Choose the local repository source, register your clone or worktree's absolute path, select a branch, and **Sync**. Enable working changes to include staged, unstaged, and untracked schema SQL from the current checkout.

To initialize directly from a local repository instead of the default `keeperd init`:

```sh
keeperd init --local=/absolute/path/to/backend --branch=main
keeperd start
```

Standard SQL input uses `db/schema/*.sql`, or replays `db/migration/*.sql` when no schema files are present, on PostgreSQL 17. Some configured repositories use dedicated Flyway, Alembic, or Airflow runners. See the [usage guide](README.md) for supported inputs.

## Everyday use

```sh
keeperd start
```

Use **Sync** whenever you want the latest schema. Your table layout, colors, Areas, and notes stay with the repository across branches.

To stop the server, press `Ctrl+C` in its terminal or run `keeperd stop` in another terminal. To start without opening a browser, use `keeperd start --no-open`.

Your workspace is saved locally in SQLite. PostgreSQL 17 runs temporarily inside Docker to reproduce schemas; no PostgreSQL server installation or production database connection is needed. On macOS, the default data directory is `~/Library/Application Support/KeepERD/`. Browsers connected to a server using the same data directory share the workspace. To move layouts to another computer, export workspace JSON and apply it to an ERD from the same repository. Matching tables can receive layouts across different branches and commits. See [storage and recovery](SQLITE.md).

## Upgrade

```sh
keeperd stop
brew update
brew upgrade keeperd
keeperd start
```

`brew update` refreshes the formula, and `brew upgrade keeperd` installs the latest available KeepERD release. Your workspace stays in its data directory. Check the installed version with `keeperd --version`.

When upgrading from browser-based storage, revisit the original address and port in each original browser or profile once to migrate its data. See the [migration guide](SQLITE.md).

## Troubleshooting

| Issue                                     | What to do                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `keeperd` is not found                    | Confirm Homebrew is on your shell's `PATH`, then run `brew list keeperd`.                       |
| Docker is unavailable                     | Start your Docker runtime and check `docker info`.                                              |
| GitHub access fails                       | Check `gh auth status`, sign in again if needed, and confirm repository access.                 |
| A server is already running               | Use the address shown in the terminal, or run `keeperd stop` before restarting.                 |
| Stop is refused during Sync               | Wait for the operation to finish, then retry `keeperd stop`.                                    |
| The schema is unsupported or replay fails | Check the supported input shown in the app and the [usage guide](README.md).                    |
| Data is missing after an upgrade          | Open the original address in the original browser and follow [storage and recovery](SQLITE.md). |
| A Homebrew runtime is damaged             | Stop KeepERD, then run `brew reinstall keeperd` and start it again.                             |

For a custom `KEEPERD_STATE_DIR`, use the same value when starting and stopping the server. To choose a port, use `LOCAL_ERD_PORT=18777 keeperd start`.

<details>
<summary>Run from source (development)</summary>

Source development requires Node.js **26.12.1**, Git, and Docker. The exact Node version is pinned in `.nvmrc`.

```sh
git clone https://github.com/craftdio/keeperd.git
cd keeperd
nvm install
nvm use
npm run local:init
npm run local:start
```

Use `npm run local:stop` to stop the server from another terminal. For local input, initialize with `npm run local:init -- --local=/absolute/path/to/backend --branch=main`. Use `npm run local:build` for the Sync-enabled app.

To update a source checkout, stop the server, preserve your local changes, fetch release tags with `git fetch --tags origin`, check out the desired `vX.Y.Z` tag, and run `npm run local:start`. A source update changes KeepERD itself; **Sync** updates the selected repository's schema.

To import an older checkout's `.local-erd` directory, stop the server and run:

```sh
npm run local:migrate -- --from=/absolute/path/to/old-checkout/.local-erd
```

The original directory is preserved. See [development](../../CONTRIBUTING.md) and [storage and recovery](SQLITE.md) for more details.

</details>

<details>
<summary>Release workflow (maintainers)</summary>

This repository publishes KeepERD releases from `main`. Product versions come from `KEEPERD_VERSION`, independently of ChartDB's `package.json` version. After validation, push a matching `vX.Y.Z` tag for a commit on `main`; the release workflow checks the version, release notes, main-branch ancestry, tests, bundle, and checksum before publishing. Update the Homebrew formula separately after the release is available.

The release bundle does not include Node. The [Homebrew formula](https://github.com/craftdio/homebrew-keeperd) supplies KeepERD's exact runtime privately; it does not replace the system Node. After publishing a release, follow the tap's [formula update workflow](https://github.com/craftdio/homebrew-keeperd#maintainers). See the [release workflow](../../.github/workflows/release.yml) for validation and publishing checks.

</details>

---

KeepERD is an independent, unofficial fork of [ChartDB](https://github.com/chartdb/chartdb), with no affiliation or endorsement. See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE) for licensing and attribution.
