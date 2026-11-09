# KeepERD — Usage Guide

[Overview](../../README.md) · [Install](SETUP.md) · [Sync](#sync-a-repository) · [Share](#share-layouts) · [Backups](SQLITE.md)

KeepERD reads schema files from Git and builds an ERD locally. Changing branches updates the schema while keeping the repository's layout, colors, Areas, and notes.

## Sync a repository

Start with `keeperd start`, then open the address printed in your terminal.

| Source                  | Steps                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| GitHub                  | Sign in with `gh auth login` and `gh auth setup-git`, select an account, repository, and branch, then **Sync**.   |
| Local clone or worktree | Choose the local source, register its absolute path, select a branch, then **Sync**. No GitHub login is required. |

The GitHub account is the server's GitHub CLI account, which may differ from your browser login. Use `gh auth switch` to change it, then refresh the account list.

Local input requires a GitHub origin URL. Unpushed commits are supported. Enable working changes to include supported staged, unstaged, and untracked schema files from the current checkout. Selecting another branch does not change your checkout; working changes apply only to the current branch. Remote, local-commit, and working-copy ERDs are stored separately.

Use the repository/branch title in the editor to switch inputs. Refresh actions reload repository or branch lists; **Sync** updates the schema. Changes are not polled automatically. A failed Sync leaves the existing ERD in place.

## Supported schema inputs

**Workspace storage is SQLite. Schema replay uses a temporary PostgreSQL 17 container.** You do not install a PostgreSQL server or connect KeepERD to your production database.

| Input                | Support                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `db/schema/*.sql`    | Preferred declarative schema input.                                                                              |
| `db/migration/*.sql` | Sequential SQL replay when declarative schema files are absent.                                                  |
| Flyway SQL           | Configured repositories only; versioned and repeatable migrations use the official runner.                       |
| Alembic revisions    | Configured repositories only; the runner requires a single migration head.                                       |
| Airflow metadata     | Configured repositories only; reproduces Airflow's metadata database, without running DAGs or business services. |

Schema Sync currently targets PostgreSQL. Other database engines, arbitrary migration configurations, production database imports, dumps, and ORM model inference are outside this Sync workflow. See the [schema replay profiles](schema-replay.mjs) for the supported repository configurations.

<details>
<summary>Configured runners</summary>

| Repository                             | Runner and input                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `NangmanAzit/myhouse-agent-backend`    | Flyway 11.7.2; `src/main/resources/db/migration`, schema `myhouse_agent`.                                      |
| `NangmanAzit/nangmanazit-data-batch`   | Flyway 11.7.2; `src/main/resources/db/migration`, schema `public`.                                             |
| `NangmanAzit/myhouse-backend`          | Python 3.14, Alembic 1.18.4, SQLAlchemy 2.0.51; `alembic/versions`, schema `myhouse`.                          |
| `NangmanAzit/nangmanazit-data-airflow` | Airflow 3.3.1 / Python 3.12 / FAB; versions must match `Dockerfile`, `docker-compose.yml`, and `.env.example`. |

Runners reproduce supported inputs in an isolated temporary database, extract its schema, and remove the temporary resources. They do not receive production credentials or start application servers, workers, or DAGs. Adding a repository profile requires implementation and replay tests.

</details>

## Compare branches

KeepERD compares the selected branch with the nearest available common ancestor against `develop` or `main`. Added and changed tables or fields are highlighted; removed items are counted in the comparison notice. If no comparison base can be resolved, a comparison is unavailable.

Table layout is shared by repository and matched by schema and table name. Tables absent from a branch keep their saved layout for when they reappear. Renames are treated as removal and addition. New tables receive new positions.

## Share layouts

Open the editor's workspace-sharing action to export or import JSON. The receiving ERD must belong to the **same repository**. Different branches and commits are supported; matching uses schema and table names, and missing tables are skipped. Sharing changes layout, not database structure.

| Export                | Includes                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Full workspace layout | Table positions, sizes, colors, Areas, and notes.                                                     |
| Selected tables       | Only the selected tables' placement and display settings; no columns, relationships, Areas, or notes. |

For selected tables, use the list, schema checkboxes, search, or canvas. Clicking a table adds it; clicking it again removes it. The selected-table chips remain visible across searches, and clicking a chip locates its table. Export as `*.keeperd-tables.json`.

Import a JSON file, review the matching and skipped counts, then apply. Unselected layouts and existing Area memberships are preserved during partial import. Its pre-change layout backup must succeed before applying. Use the import panel's undo action to restore the affected tables only. Full-layout import attempts a backup but can continue with a warning if backup storage fails.

Full exports use `*.keeperd-layout.json`. Both formats are manual files; KeepERD does not upload them automatically. Full exports can contain note text. Files over 5 MB or with invalid content are rejected.

## Edit and manage ERDs

- Use **Filter Tables** to search by schema or Area and toggle visibility. Non-`public` schemas may initially be hidden. On macOS, `⌘F` toggles the panel.
- Use **Tables**, **DBML**, **Refs**, and **Visuals** to inspect structure and organize Areas and notes.
- Open the saved-ERD manager at `/saved` to search or delete saved work. Deletion affects all browsers using the same data directory. Export important work first; re-syncing does not restore deleted layouts or notes.

Editor changes stay local; they do not change repository files or a live database. A later Sync can replace manual schema edits. Browsers share persisted workspace data, without live merging of simultaneous edits. If a save conflict occurs, export unsaved work as diagram JSON before refreshing.

For migration, backup limits, and recovery, see [Storage & Backups](SQLITE.md). For Sync errors and authentication, see [Troubleshooting](SETUP.md#troubleshooting).

KeepERD is an independent, unofficial fork of [ChartDB](https://github.com/chartdb/chartdb). See [LICENSE](../../LICENSE) and [NOTICE](../../NOTICE).
