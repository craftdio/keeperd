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

Node.js 22 이상, Git, 실행 중인 Docker가 필요합니다. 원격 GitHub 모드에서는 GitHub CLI (`gh`)도 필요합니다.
대상 저장소는 PostgreSQL 17에서 실행 가능한 `db/schema/*.sql` 또는 `db/migration/*.sql`을 포함해야 합니다. 둘 다 있으면 Atlas의 최종 목표 상태인 `db/schema`를 우선 사용하고 migration은 실행하지 않습니다. 등록된 `NangmanAzit/myhouse-agent-backend`와 `NangmanAzit/nangmanazit-data-batch`는 `src/main/resources/db/migration/{V,R}*.sql`을 공식 Flyway 11.7.2 컨테이너로 실행합니다. `NangmanAzit/myhouse-backend`는 `alembic/versions/*.py`를 고정 Python 3.14·Alembic 1.18.4 runner로 실행합니다. `NangmanAzit/nangmanazit-data-airflow`는 세 버전 파일에 고정된 Airflow 3.3.1/Python 3.12 공식 이미지로 **Airflow 메타 DB**만 초기화합니다. DAG·Collector·Batch와 업무 DB는 실행하거나 읽지 않습니다.
Docker Desktop을 사용한다면 먼저 앱을 실행하세요.

원격 모드에서는 대상 백엔드에 접근 가능한 GitHub 계정으로 로그인하세요. 로컬 모드는 이 인증 단계를 건너뜁니다. 비공개 저장소 clone에는 별도 Git 인증이 필요할 수 있습니다.

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

<br />

### 2. Clone하고 한 번에 초기화

코드를 보관할 상위 디렉터리에서 실행합니다. 이미 `keeperd` 폴더가 있다면 다른 위치를 선택하세요.

```sh
git clone https://github.com/craftdio/keeperd.git
cd keeperd
npm run local:init
```

명령은 개인 설정 생성 → 의존성 설치 → 로컬 빌드를 처리합니다. 수 분이 걸릴 수 있습니다. 완료 후 서버를 실행해 화면에서 GitHub 저장소와 브랜치를 선택하고 Sync합니다.

Homebrew 등으로 KeepERD를 설치한 뒤에는 같은 흐름을 `keeperd init`으로 실행합니다. 소스 checkout에서 개발할 때는 위의 `npm run local:init`을 계속 사용합니다.

macOS의 개인 설정·스냅샷·내부 Git clone은 실행한 소스 폴더가 아니라 `~/Library/Application Support/KeepERD/`에 저장됩니다. 다른 checkout이나 worktree에서 실행해도 같은 KeepERD 데이터를 사용하며, 로컬 입력은 실제 절대 경로로 구분됩니다.

설정 파일을 직접 만들거나 `local:sync`, `local:build`를 각각 실행할 필요가 없습니다. 실패하면 문제를 해결하고 같은 명령을 다시 실행하세요. 기존 설정·스냅샷과 완료한 빌드는 재사용합니다.

clone에서 고르는 것은 KeepERD 소스 버전이고, 화면에서 고르는 것은 백엔드 스키마 브랜치입니다.

**GitHub에 push하기 전 로컬 저장소부터 보려면** 일반 초기화 대신 아래 명령을 사용하세요. GitHub CLI 로그인 없이 로컬 경로를 등록하고 로컬 브랜치의 첫 ERD를 생성합니다. 의존성 설치·최초 Docker 이미지 준비에는 인터넷이 필요할 수 있습니다.

```sh
npm run local:init -- --local=/Users/you/Documents/code/backend --branch=main
```

서버 실행 후 입력 출처를 **로컬 저장소**로 바꾸세요. 다른 clone/worktree는 화면에서 절대 경로로 등록할 수 있습니다. 처음부터 미커밋 변경을 보려면 초기화 후 **작업 중 변경 포함 → Sync**를 누릅니다.

<br />

### 3. 실행하고 브라우저 열기

```sh
npm run local:start
```

서버가 준비되면 macOS의 **시스템 기본 브라우저**에서 KeepERD가 한 번 열립니다. Comet을 기본 브라우저로 지정했다면 Comet에서 열리지만, 최근 사용한 브라우저나 특정 프로필을 자동 선택하지는 않습니다. 자동으로 열리지 않으면 터미널에 표시된 `http://localhost:<실제 포트>/`를 직접 여세요(기본 포트는 **[http://localhost:18777/](http://localhost:18777/)**). 현재 GitHub CLI 로그인 계정의 프로필과 이름이 표시됩니다. 그 아래에서 **조직/계정 → 레포 → 브랜치 → Sync**를 선택하면 해당 ERD가 열립니다. **저장된 ERD 관리** 버튼으로 별도 페이지에서 기존 ERD를 필터링해 열거나 선택 삭제할 수 있습니다.

자동 열기를 원하지 않으면 소스 checkout은 `npm run local:start -- --no-open`, 설치본은 `keeperd start --no-open`을 사용하세요. CI·SSH에서는 자동 열기를 건너뛰며, 브라우저 실행이 실패해도 서버는 계속 실행되고 주소가 출력됩니다. `init`, `sync`, `stop`은 브라우저를 열지 않습니다.

패키지 설치본에서는 `keeperd start`를 사용합니다. 터미널 Sync가 필요하면 기존 `npm run local:sync -- --repository=GitHub_URL --branch=main`와 같은 인수를 `keeperd sync --repository=GitHub_URL --branch=main`으로 그대로 전달할 수 있습니다.

인증이 없거나 만료됐으면 메인 화면의 안내대로 서버를 실행한 컴퓨터의 터미널에서 `gh auth login --hostname github.com --git-protocol https --web` → `gh auth setup-git` → `gh auth status`를 실행하고 **로그인 다시 확인**을 누르세요. 별도 웹 로그인 폼이나 서버 재시작은 필요 없습니다. 기존 ERD·배치는 그대로 보관됩니다.

다음부터는 KeepERD 폴더에서 `npm run local:start`만 실행하면 됩니다. KeepERD source version을 변경하거나 업데이트한 뒤에도 빌드가 현재 코드와 다를 때만 자동으로 다시 빌드합니다. 스키마 최신화는 Docker를 켜고 **레포 → 브랜치 → Sync**를 누르세요.

다른 브라우저·프로필·컴퓨터로 배치와 색상을 옮기려면 ERD 화면의 **작업 데이터 공유**를 사용하세요. 보내는 쪽에서 JSON을 내보낸 뒤 받는 쪽에서 같은 레포·브랜치·커밋의 ERD를 Sync하고 파일을 적용합니다. 스키마는 바뀌지 않으며 테이블 배치·크기·색상, Area, 메모만 옮겨집니다. 적용 전 상태는 자동 백업되어 한 번 되돌릴 수 있습니다.

포트를 지정하려면 `LOCAL_ERD_PORT=18777 npm run local:start`로 실행하세요. 실제 바인딩된 포트의 주소가 열리고 터미널에도 표시됩니다. 포트·호스트명이 바뀌면 브라우저 배치 저장 공간도 달라지므로 기존 배치는 JSON으로 내보내 가져오세요.

서버 터미널에서는 `Ctrl+C`로 종료합니다. 다른 터미널에서는 패키지 설치본이면 `keeperd stop`, 소스 checkout이면 `npm run local:stop`을 실행하세요. 이 명령은 **현재 사용자 데이터 폴더**의 잠금과 실제 서버의 응답을 함께 확인한 뒤 해당 서버만 정상 종료합니다. `KEEPERD_STATE_DIR`로 별도 상태 폴더를 지정했다면 `start`와 `stop`에 같은 값을 지정하세요. Sync나 저장소 작업 중에는 종료를 거부하므로 완료 후 다시 실행해야 합니다. 오래된 잠금, 다른 프로세스가 사용 중인 포트, 정체가 확인되지 않는 예전 서버에는 신호를 보내거나 강제 종료하지 않습니다. 종료 후 같은 포트에서 다시 시작하면 설정·스냅샷이 유지됩니다. 브라우저 배치는 같은 브라우저·주소에 저장됩니다. 자세한 저장·백업 설명은 [커스텀 기능 사용법](README.md)을 확인하세요.

같은 전역 데이터 폴더를 사용하는 `local:start`, `local:sync`, 마이그레이션은 동시에 실행할 수 없습니다. 이미 서버가 실행 중이면 기존 주소를 안내하므로 그 서버를 사용하거나 먼저 종료하세요.

### 기존 `.local-erd` 가져오기

이전 checkout에 있던 데이터는 자동 이동·삭제하지 않습니다. KeepERD 서버를 종료한 뒤 절대 경로를 지정해 명시적으로 가져오세요. 기존 폴더는 보존되며, 여러 checkout의 데이터는 명령을 하나씩 실행해 합칠 수 있습니다.

```sh
npm run local:migrate -- --from=/Users/you/code/keeperd/.local-erd
```

<br />

### 코드 업데이트

JSON 백업 후 서버를 종료하고, 직접 수정한 파일이 없는지 `git status --short`로 확인합니다. 공개 source checkout은 검증된 `vX.Y.Z` release tag 기준으로 업데이트하세요.

```sh
git fetch --tags origin
git checkout vX.Y.Z
npm run local:start
```

`local:start`는 코드가 바뀌었을 때만 로컬 앱을 다시 빌드합니다. 기존 스키마·배치는 유지합니다. release tag 변경은 KeepERD 코드 업데이트이며 Sync는 백엔드 스키마 업데이트입니다. 로컬 변경이 있거나 tag 전환이 실패하면 강제로 초기화하지 말고 변경을 확인하세요.

<br />

### KeepERD Release Candidate 검증 (관리자)

이 private 개발 저장소는 사용자용 GitHub Release를 만들지 않습니다. KeepERD 제품 버전의 단일 기준은 저장소 루트의 `KEEPERD_VERSION`이며, `package.json`의 ChartDB upstream 버전과는 별개입니다.

PR CI는 `npm ci` → KeepERD 로컬 화면 build → `KEEPERD_VERSION` 검증 → release bundle 생성 → SHA256 검증까지 수행합니다. 검증된 source snapshot은 public canonical source repository인 `craftdio/keeperd`로 승격합니다. 실제 `vX.Y.Z` tag, GitHub Release와 Homebrew가 참조할 asset은 그 저장소에서 생성합니다.

CI가 검증하는 bundle은 다음 구조를 사용합니다.

```text
keeperd-v0.1.0.tar.gz
keeperd-v0.1.0.tar.gz.sha256
```

archive는 사전 빌드된 `dist/`, KeepERD 런타임 스크립트, CLI, `KEEPERD_VERSION`, 라이선스·출처 고지와 선택적 재빌드용 npm manifest만 포함합니다. `node_modules`나 테스트 파일은 넣지 않습니다. archive 안의 build marker는 Git checkout이 없는 Homebrew 설치 경로에서도 포함된 화면을 현재 build로 인식하도록 설정됩니다.

`craftdio/keeperd`에서 실제 Release asset을 만든 뒤에는 그 저장소에서 SHA256과 CLI를 점검합니다.

```sh
shasum -a 256 -c keeperd-v0.1.0.tar.gz.sha256
tar -xzf keeperd-v0.1.0.tar.gz
node keeperd-v0.1.0/bin/keeperd.mjs --help
node keeperd-v0.1.0/bin/keeperd.mjs --version
```

다음 단계의 `craftdio/homebrew-keeperd` Formula는 `craftdio/keeperd` Release의 tarball URL과 SHA256만 참조합니다. Formula 작성·갱신 자동화와 public Release publish는 이 저장소의 범위가 아닙니다.

<br />

### 문제가 생겼다면

- GitHub 인증 실패: `gh auth status`와 대상 저장소 접근 권한 확인.
- `DOCKER_UNAVAILABLE`: Docker 앱을 실행하고 `docker info`와 Docker 네트워크 상태 확인.
- `SCHEMA_RUNNER_UNAVAILABLE`: Flyway/Airflow 이미지를 받거나 최소 Alembic runner를 빌드할 수 있는 Docker 네트워크인지 확인.
- `SCHEMA_METHOD_UNSUPPORTED` / `SCHEMA_CONFIGURATION_MISSING`: 화면에 표시되는 **현재 지원 방식**과 저장소별 경로를 확인. 저장소나 브랜치를 다시 선택하기 전까지 Sync가 잠깁니다.
- `SCHEMA_CONFIGURATION_AMBIGUOUS`: Alembic `heads`가 여러 개입니다. 저장소에 merge revision을 추가해 단일 head를 만든 뒤 다시 Sync합니다.
- `SCHEMA_VERSION_UNSUPPORTED`: Airflow 저장소의 `Dockerfile`, `docker-compose.yml`, `.env.example`에 정의된 Airflow/Python 버전과 FAB auth manager가 지원 프로필과 일치하는지 확인합니다.
- `SCHEMA_REPLAY_FAILED`: 터미널에 표시된 선언 스키마·Flyway SQL·Alembic revision·Airflow 버전과 PostgreSQL 17 호환성 확인. 운영 DB 접속은 필요하지 않습니다.
- `GITHUB_AUTH_REQUIRED` / `GITHUB_PERMISSION_DENIED` / `GITHUB_NETWORK_FAILED` / `GIT_BRANCH_NOT_FOUND`: 각각 CLI 로그인, 저장소 권한, 인터넷 연결, 브랜치 존재 여부 확인.
- 연결 거부: `local:start` 터미널과 주소 확인. 기존 KeepERD 실행 안내가 나오면 표시된 주소를 사용하거나 기존 서버를 종료.
- 준비되지 않은 폴더에서 `local:start`를 실행하면 `local:init` 안내가 표시됩니다.
- 일반 `npm run build` 대신 `local:init` 또는 `local:build`를 사용해야 Sync가 활성화됩니다.
