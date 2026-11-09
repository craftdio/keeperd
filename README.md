<p align="center">
  <b>A local ERD workspace for your Git branches.</b>
</p>

<h5 align="center">
  <a href="tools/local-erd/SETUP.md#install-with-homebrew">Install</a> &bull;
  <a href="tools/local-erd/README.md#sync-a-repository">Sync</a> &bull;
  <a href="tools/local-erd/README.md#share-layouts">Share</a> &bull;
  <a href="tools/local-erd/SQLITE.md#backup-and-restore">Backups</a> &bull;
  <a href="CONTRIBUTING.md">Contribute</a>
</h5>

---

<h1 align="center">
  <img src="./docs/assets/keeperd-banner.png" width="760" alt="KeepERD — dark banner with an icy-blue geometric symbol and off-white wordmark">
</h1>

<p align="center">
  <b>Switch branches. Keep your layout.</b><br>
  Explore schema changes. Keep your ERD organized.
</p>

<h3 align="center">
  <a href="#how-to-get-started">Quick Start</a> &bull;
  <a href="tools/local-erd/README.md">Guide</a> &bull;
  <a href="https://github.com/craftdio/keeperd/issues">Issues</a>
</h3>

<p align="center">
  <a href="https://github.com/craftdio/homebrew-keeperd"><img src="https://img.shields.io/badge/Install-Homebrew-91BEC9?logo=homebrew&amp;logoColor=white&amp;labelColor=161B22" alt="Install with Homebrew"></a>
  <a href=".nvmrc"><img src="https://img.shields.io/badge/Runtime-Node.js%2026.12.1-91BEC9?logo=nodedotjs&amp;logoColor=white&amp;labelColor=161B22" alt="Node.js 26.12.1 runtime, installed automatically by Homebrew"></a>
  <a href="tools/local-erd/README.md#supported-schema-inputs"><img src="https://img.shields.io/badge/Schema%20Replay-PostgreSQL%2017-91BEC9?logo=postgresql&amp;logoColor=white&amp;labelColor=161B22" alt="PostgreSQL 17 schema replay in Docker"></a>
  <a href="tools/local-erd/SQLITE.md"><img src="https://img.shields.io/badge/Storage-SQLite-91BEC9?labelColor=161B22" alt="Workspace stored locally in SQLite"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-91BEC9?labelColor=161B22" alt="GNU AGPL version 3"></a>
</p>

---

<a id="features"></a>

## 🧱 KeepERD

Turn versioned schemas into ERDs. Sync GitHub or local branches, compare changes, and keep your layout. Workspace data stays on your computer in SQLite. See [supported schema inputs](tools/local-erd/README.md#supported-schema-inputs).

### What you can do

| Feature           | What it does                                                           |
| ----------------- | ---------------------------------------------------------------------- |
| Branch Sync       | Build an ERD from versioned schema files.                              |
| Local Changes     | Inspect unpushed commits and working schema SQL.                       |
| Schema Diff       | Highlight added or changed tables and fields.                          |
| Persistent Layout | Keep table positions, sizes, colors, Areas, and notes across branches. |
| Local Storage     | Share one local workspace across browsers and profiles.                |
| Layout Sharing    | Share all or selected table layouts within the same repository.        |

<a id="how-to-get-started"></a>

## 🏃🏻 Getting Started

Install [Homebrew](https://brew.sh), then install and start a Docker-compatible runtime for schema replay.

```sh
brew install craftdio/keeperd/keeperd
keeperd init
keeperd start
```

Open the address printed in your terminal, select a repository and branch, then **Sync**.
For GitHub repositories, run `gh auth login` and `gh auth setup-git` first. Local repositories need no GitHub login.

### 🤸‍♂️ Upgrade

```sh
keeperd stop
brew update
brew upgrade keeperd
keeperd start
```

Homebrew supplies the app runtime and CLI dependencies. For authentication and local repositories, see the [setup guide](tools/local-erd/SETUP.md).

<p align="center">
  <a href="tools/local-erd/README.md">Usage Guide</a> &bull;
  <a href="tools/local-erd/SETUP.md#troubleshooting">Troubleshooting</a> &bull;
  <a href="CONTRIBUTING.md">Contribute</a>
</p>

<p align="center">
  <sub>KeepERD is an independent, unofficial fork of <a href="https://github.com/chartdb/chartdb">ChartDB</a>, with no affiliation or endorsement.<br>
  Licensed under <a href="LICENSE">GNU AGPL v3</a>. See <a href="NOTICE">NOTICE</a> for source and attribution details.</sub>
</p>
