<h3 align="center">
  <strong>🍴 KeepERD — 설치·실행 가이드</strong>
</h3>

<p align="center">
  <a href="../../README.md">루트 README</a> &bull;
  <strong>✨ 설치·실행 가이드</strong> &bull;
  <a href="README.md">커스텀 기능 사용법</a>
</p>

<p align="center">
  다른 컴퓨터에서도 세 단계로 실행할 수 있습니다.<br />
  명령은 macOS/Linux 또는 WSL 셸 기준입니다.
</p>

> KeepERD는 ChartDB 기반의 독립적인 비공식 포크이며, ChartDB와 제휴하거나 보증을 받지 않습니다. 원본 저작권 고지와 AGPL-3.0 라이선스를 유지합니다. 자세한 출처 표기는 루트 [NOTICE](../../NOTICE)를 참고하세요.

---

### 1. 준비물과 인증

일반 사용자는 [공개 Homebrew tap](https://github.com/craftdio/homebrew-keeperd)을 통한 설치를 권장합니다. Homebrew Formula가 Node, Git, GitHub CLI (`gh`)를 자동으로 설치합니다. Docker는 Formula에 포함되지 않으므로 스키마 재현 기능을 사용하기 전에 Docker Desktop 또는 Docker 호환 런타임을 별도로 설치하고 실행해야 합니다.
대상 저장소는 PostgreSQL 17에서 실행 가능한 `db/schema/*.sql` 또는 `db/migration/*.sql`을 포함해야 합니다. 둘 다 있으면 Atlas의 최종 목표 상태인 `db/schema`를 우선 사용하고 migration은 실행하지 않습니다.
Docker Desktop을 사용한다면 먼저 앱을 실행하세요.

원격 GitHub 입력을 사용할 때는 대상 백엔드에 접근 가능한 GitHub 계정으로 로그인해야 할 수 있습니다. 로컬 clone/worktree 입력은 이 인증 단계를 건너뜁니다. 비공개 저장소 clone에는 별도 Git 인증이 필요할 수 있습니다.

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

<br />

### 2. Homebrew 설치 및 초기화

```sh
brew tap craftdio/keeperd
brew install keeperd
keeperd init
```

`keeperd init`은 설치된 패키지에서 개인 설정 생성과 초기화를 처리하는
`npm run local:init`의 대응 명령입니다. source checkout 안에서는 아래의
`npm run local:init`을 사용하세요.

macOS의 개인 설정·스냅샷·내부 Git clone은 실행한 소스 폴더가 아니라 `~/Library/Application Support/KeepERD/`에 저장됩니다. 다른 checkout이나 worktree에서 실행해도 같은 KeepERD 데이터를 사용하며, 로컬 입력은 실제 절대 경로로 구분됩니다.

설정 파일을 직접 만들거나 `local:sync`, `local:build`를 각각 실행할 필요가 없습니다. 실패하면 문제를 해결하고 같은 명령을 다시 실행하세요. 기존 설정·스냅샷과 완료한 빌드는 재사용합니다.

**GitHub에 push하기 전 로컬 저장소부터 보려면** GitHub CLI 로그인 없이 다음처럼 로컬 경로를 등록하고 로컬 브랜치의 첫 ERD를 생성할 수 있습니다. 의존성 설치·최초 Docker 이미지 준비에는 인터넷이 필요할 수 있습니다.

```sh
keeperd init --local=/Users/you/Documents/code/backend --branch=main
```

서버 실행 후 입력 출처를 **로컬 저장소**로 바꾸세요. 다른 clone/worktree는 화면에서 절대 경로로 등록할 수 있습니다. 처음부터 미커밋 변경을 보려면 초기화 후 **작업 중 변경 포함 → Sync**를 누릅니다.

<br />

### 3. 실행하고 브라우저 열기

```sh
keeperd start
```

`keeperd start`는 설치된 패키지에서 `npm run local:start`에 대응하는 명령입니다. 브라우저에서 **[http://localhost:18777/](http://localhost:18777/)** 을 여세요. 현재 GitHub CLI 로그인 계정의 프로필과 이름이 표시됩니다. 그 아래에서 **조직/계정 → 레포 → 브랜치 → Sync**를 선택하면 해당 ERD가 열립니다. **저장된 ERD 관리** 버튼으로 별도 페이지에서 기존 ERD를 필터링해 열거나 선택 삭제할 수 있습니다. 브라우저는 직접 엽니다.

터미널 Sync가 필요하면 `keeperd sync --repository=GitHub_URL --branch=main`처럼 사용합니다. 인증이 없거나 만료됐으면 메인 화면의 안내대로 서버를 실행한 컴퓨터의 터미널에서 `gh auth login --hostname github.com --git-protocol https --web` → `gh auth setup-git` → `gh auth status`를 실행하고 **로그인 다시 확인**을 누르세요. 별도 웹 로그인 폼이나 서버 재시작은 필요 없습니다. 기존 ERD·배치는 그대로 보관됩니다.

다음부터 Homebrew 설치본에서는 `keeperd start`만 실행하면 됩니다. 스키마 최신화는 Docker를 켜고 **레포 → 브랜치 → Sync**를 누르세요.

다른 브라우저·프로필·컴퓨터로 배치와 색상을 옮기려면 ERD 화면의 **작업 데이터 공유**를 사용하세요. 보내는 쪽에서 JSON을 내보낸 뒤 받는 쪽에서 같은 레포·브랜치·커밋의 ERD를 Sync하고 파일을 적용합니다. 스키마는 바뀌지 않으며 테이블 배치·크기·색상, Area, 메모만 옮겨집니다. 적용 전 상태는 자동 백업되어 한 번 되돌릴 수 있습니다.

포트를 지정하려면 `LOCAL_ERD_PORT=18777 keeperd start`로 실행하고 표시된 주소를 엽니다. 포트·호스트명이 바뀌면 브라우저 배치 저장 공간도 달라지므로 기존 배치는 JSON으로 내보내 가져오세요.

서버 터미널은 실행 상태로 두고, 종료할 때 `Ctrl+C`를 누릅니다. 배치는 같은 브라우저·주소에 저장됩니다. 자세한 저장·백업 설명은 [커스텀 기능 사용법](README.md)을 확인하세요.

같은 전역 데이터 폴더를 사용하는 `keeperd start`, `keeperd sync`, 마이그레이션은 동시에 실행할 수 없습니다. 이미 서버가 실행 중이면 기존 주소를 안내하므로 그 서버를 사용하거나 먼저 종료하세요.

<br />

### 4. 소스 checkout에서 실행

개발, 기여, 수동 소스 기반 실행에는 source checkout을 사용하세요. Node.js 22 이상, Git, 실행 중인 Docker가 필요합니다. 원격 GitHub 모드에서만 GitHub CLI (`gh`) 로그인도 필요합니다.

코드를 보관할 상위 디렉터리에서 실행합니다. 이미 `keeperd` 폴더가 있다면 다른 위치를 선택하세요.

```sh
git clone https://github.com/craftdio/keeperd.git
cd keeperd
npm run local:init
```

명령은 개인 설정 생성 → 의존성 설치 → 로컬 빌드를 처리합니다. 수 분이 걸릴 수 있습니다. 완료 후 아래 명령으로 서버를 실행해 화면에서 GitHub 저장소와 브랜치를 선택하고 Sync합니다. 설치된 패키지에서는 이 초기화를 `keeperd init`으로 실행하지만, source checkout에서는 위의 `npm run local:init`을 계속 사용합니다.

clone에서 고르는 것은 KeepERD 소스 버전이고, 화면에서 고르는 것은 백엔드 스키마 브랜치입니다.

**GitHub에 push하기 전 로컬 저장소부터 보려면** 일반 초기화 대신 아래 명령을 사용하세요. GitHub CLI 로그인 없이 로컬 경로를 등록하고 로컬 브랜치의 첫 ERD를 생성합니다. 의존성 설치·최초 Docker 이미지 준비에는 인터넷이 필요할 수 있습니다.

```sh
npm run local:init -- --local=/Users/you/Documents/code/backend --branch=main
```

서버 실행 후 입력 출처를 **로컬 저장소**로 바꾸세요. 다른 clone/worktree는 화면에서 절대 경로로 등록할 수 있습니다. 처음부터 미커밋 변경을 보려면 초기화 후 **작업 중 변경 포함 → Sync**를 누릅니다.

<br />

```sh
npm run local:start
```

다음부터는 source checkout에서 `npm run local:start`만 실행하면 됩니다. KeepERD source version을 변경하거나 업데이트한 뒤에도 빌드가 현재 코드와 다를 때만 자동으로 다시 빌드합니다.

포트를 지정하려면 `LOCAL_ERD_PORT=18777 npm run local:start`로 실행하고 표시된 주소를 엽니다. 같은 전역 데이터 폴더를 사용하는 `local:start`, `local:sync`, 마이그레이션은 동시에 실행할 수 없습니다. 이미 서버가 실행 중이면 기존 주소를 안내하므로 그 서버를 사용하거나 먼저 종료하세요.

### 기존 `.local-erd` 가져오기

이전 checkout에 있던 데이터는 자동 이동·삭제하지 않습니다. KeepERD 서버를 종료한 뒤 절대 경로를 지정해 명시적으로 가져오세요. 기존 폴더는 보존되며, 여러 checkout의 데이터는 명령을 하나씩 실행해 합칠 수 있습니다.

```sh
npm run local:migrate -- --from=/Users/you/code/keeperd/.local-erd
```

<br />

### 업데이트

Homebrew 설치본은 JSON 백업 후 서버를 종료하고 다음처럼 업데이트하세요.

```sh
brew update
brew upgrade keeperd
```

기존 스키마·배치는 유지합니다. 다음 source checkout 절차는 개발·소스 기반 실행에만 적용됩니다.

#### 소스 checkout 업데이트

JSON 백업 후 서버를 종료하고, 직접 수정한 파일이 없는지 `git status --short`로 확인합니다. 공개 source checkout은 검증된 `vX.Y.Z` release tag 기준으로 업데이트하세요.

```sh
git fetch --tags origin
git checkout vX.Y.Z
npm run local:start
```

`local:start`는 코드가 바뀌었을 때만 로컬 앱을 다시 빌드합니다. 기존 스키마·배치는 유지합니다. release tag 변경은 KeepERD 코드 업데이트이며 Sync는 백엔드 스키마 업데이트입니다. 로컬 변경이 있거나 tag 전환이 실패하면 강제로 초기화하지 말고 변경을 확인하세요.

<br />

### KeepERD 공개 Release (관리자)

`craftdio/keeperd`는 KeepERD의 public canonical source repository이며 사용자용 GitHub Release를 게시합니다. KeepERD 제품 버전의 단일 기준은 저장소 루트의 `KEEPERD_VERSION`이며, `package.json`의 ChartDB upstream 버전과는 별개입니다.

PR CI는 build, test, release bundle 생성과 SHA256 검증을 수행합니다. 관리자가 `KEEPERD_VERSION`과 일치하는 `vX.Y.Z` tag를 `main`의 commit에 push하면 public Release workflow가 tag와 version, `main` 포함 여부를 검증하고 깨끗한 KeepERD production build에서 bundle을 다시 생성합니다. 모든 검증이 끝난 뒤에만 해당 tag의 GitHub Release와 Homebrew가 참조할 asset을 게시합니다.

CI가 검증하는 bundle은 다음 구조를 사용합니다.

```text
keeperd-v0.1.0.tar.gz
keeperd-v0.1.0.tar.gz.sha256
```

archive는 사전 빌드된 `dist/`, KeepERD 런타임 스크립트, CLI, `KEEPERD_VERSION`, 라이선스·출처 고지와 선택적 재빌드용 npm manifest만 포함합니다. `node_modules`나 테스트 파일은 넣지 않습니다. archive 안의 build marker는 Git checkout이 없는 Homebrew 설치 경로에서도 포함된 화면을 현재 build로 인식하도록 설정됩니다.

Release workflow는 게시 전에 생성된 asset의 SHA256과 압축을 푼 CLI의 version 및 help 출력을 점검합니다. 수동으로 확인할 때는 다음 명령을 사용할 수 있습니다.

```sh
shasum -a 256 -c keeperd-v0.1.0.tar.gz.sha256
tar -xzf keeperd-v0.1.0.tar.gz
node keeperd-v0.1.0/bin/keeperd.mjs --help
node keeperd-v0.1.0/bin/keeperd.mjs --version
```

[`craftdio/homebrew-keeperd`](https://github.com/craftdio/homebrew-keeperd) Formula는 `craftdio/keeperd` GitHub Release의 immutable tarball URL과 게시된 SHA256만 참조합니다. Homebrew Formula 작성과 갱신은 별도 단계이며 이 저장소의 Release workflow는 Homebrew repository를 수정하지 않습니다.

<br />

### 문제가 생겼다면

- GitHub 인증 실패: `gh auth status`와 대상 저장소 접근 권한 확인.
- Docker 오류: Docker 앱을 실행하고 `docker info` 확인.
- 스키마 재현 실패: 터미널에 표시된 선언 스키마 또는 마이그레이션 파일과 PostgreSQL 17 호환성 확인. 운영 DB 접속은 필요하지 않습니다.
- 연결 거부: `local:start` 터미널과 주소 확인. 기존 KeepERD 실행 안내가 나오면 표시된 주소를 사용하거나 기존 서버를 종료.
- 준비되지 않은 폴더에서 `local:start`를 실행하면 `local:init` 안내가 표시됩니다.
- 일반 `npm run build` 대신 `local:init` 또는 `local:build`를 사용해야 Sync가 활성화됩니다.
