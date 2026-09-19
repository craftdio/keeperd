# KeepERD

KeepERD는 Git repository의 브랜치별 PostgreSQL 스키마를 로컬에서 동기화해
ERD로 확인하고 비교하는 도구입니다. 브랜치의 스키마 구조는 선택한 Git
입력을 따르고, 같은 repository의 테이블 배치·색상·Area·메모는 브랜치 사이에
계속 유지합니다.

> KeepERD는 ChartDB를 기반으로 만든 독립적인 비공식 포크입니다. ChartDB와
> 제휴하거나 보증을 받지 않습니다.

## Why KeepERD

스키마 변경을 코드와 함께 관리하는 프로젝트에서 브랜치를 전환할 때마다 ERD를
다시 만들 필요 없이, 해당 브랜치의 SQL을 동기화해 현재 구조와 변경점을 볼 수
있습니다. GitHub 원격 repository뿐 아니라 아직 push하지 않은 로컬 clone과
worktree의 커밋·작업 중 변경도 별도 입력으로 확인할 수 있습니다.

## 현재 지원 기능

- GitHub 계정·조직에서 repository와 branch를 골라 스키마 Sync
- 로컬 clone/worktree를 등록해 push 전 branch commit 또는 작업 중 SQL 확인
- PostgreSQL 17 기준 `db/schema/*.sql`을 우선 사용하고, 없으면
  `db/migration/*.sql`을 순서대로 재현
- branch의 공통 조상과 비교해 추가·변경된 테이블과 필드를 ERD에서 표시
- 같은 repository의 테이블 배치·크기·색상, Area, 메모를 branch 간에 보존
- 브라우저의 작업 배치를 JSON으로 내보내거나 같은 repository의 다른 브라우저에 적용

Sync한 스키마와 개인 설정은 로컬에 저장되며 GitHub로 자동 업로드하지 않습니다.

## 시작하기

### 소스 checkout에서 실행 — 현재 사용 가능

Node.js 22 이상, Git, Docker가 필요합니다. GitHub 원격 repository를 사용할
때만 GitHub CLI(`gh`) 로그인도 필요합니다. 로컬 repository만 사용할 때는
GitHub 로그인이 필요 없습니다.

```sh
git clone https://github.com/craftdio/keeperd.git
cd keeperd
npm run local:init
npm run local:start
```

브라우저에서 [http://localhost:18777/](http://localhost:18777/)을 열고,
**조직/계정 → repository → branch → Sync** 순서로 선택하세요. `127.0.0.1`으로
접속하면 KeepERD가 정식 주소인 `localhost`로 이동합니다.

`local:init`은 필요한 의존성 설치와 첫 로컬 build를 처리합니다. 이후에는
`npm run local:start`만 실행하면 됩니다.

### 설치된 KeepERD CLI

Release bundle 또는 향후 Homebrew 설치본에서는 같은 흐름을 아래처럼 사용합니다.

```sh
keeperd init
keeperd start
```

Homebrew Formula는 아직 배포되지 않았습니다. Formula가 공개되기 전에는
`brew tap` 또는 `brew install` 명령을 실행하지 마세요.

## Repository Sync

- **GitHub 원격 입력**: `gh auth login` 후 화면에서 repository와 branch를
  선택합니다. 인증 토큰은 브라우저에 전달하지 않습니다.
- **로컬 입력**: 화면에서 서버 컴퓨터의 clone/worktree 절대 경로를 등록합니다.
  push하지 않은 commit을 읽을 수 있으며, 현재 checkout에서는 staged·unstaged·
  미추적 스키마 SQL을 포함해 확인할 수 있습니다.
- **ERD 작업 데이터**: 위치·색상·Area·메모는 현재 브라우저 IndexedDB에
  저장됩니다. 다른 브라우저나 컴퓨터로 옮길 때는 ERD 화면의 **작업 데이터 공유**
  JSON을 사용하세요.

원격·로컬 입력의 차이, 스키마 파일 경로, Sync 실패 시 기존 ERD 보존 방식 등은
[KeepERD 기능 가이드](tools/local-erd/README.md)에서 확인할 수 있습니다.

## 문서

- [설치·실행 가이드](tools/local-erd/SETUP.md): 준비물, GitHub 인증, 로컬
  repository/worktree, 데이터 이전, 업데이트, Release 절차
- [KeepERD 기능 가이드](tools/local-erd/README.md): Sync 동작, branch 비교,
  저장·백업, layout 공유, 관리 화면
- [Contributing guide](CONTRIBUTING.md): 이 repository에 기여하는 방법
- [KeepERD Issues](https://github.com/craftdio/keeperd/issues): 버그, 질문,
  기능 요청

## Development

소스 checkout에서 개발할 때는 아래 명령을 사용합니다.

```sh
npm ci
npm run local:init
npm run local:start
```

주요 검증 명령은 다음과 같습니다.

```sh
npm run lint
npm run local:test:cli
npm run local:build
```

기존 ChartDB editor 개발 흐름인 `npm run dev`와 `npm run build`도 유지됩니다.
KeepERD의 repository Sync UI는 `local:init` 또는 `local:build`가 만드는 로컬
build에서 활성화됩니다.

## Upstream & License

KeepERD is an independent, unofficial fork based on
[ChartDB](https://github.com/chartdb/chartdb). It is not affiliated with or
endorsed by ChartDB.

KeepERD와 원본 ChartDB의 저작권·라이선스 고지는
[GNU Affero General Public License v3.0](LICENSE)를 따릅니다. 원본 출처,
KeepERD 수정 소스, 필요한 attribution은 [NOTICE](NOTICE)에 명시되어 있습니다.
