import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    canonicalRepository,
    listBranches,
    validateBranch,
} from './branches.mjs';
import { registerLocalRepository, localBranches } from './local-source.mjs';
import { hasCurrentBuild } from './build-state.mjs';
import { localCommand } from './cli-command.mjs';
import { stateDirectory } from './state-paths.mjs';
import { acquireStateLock } from './state-lock.mjs';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
);
const state = stateDirectory();
const configFile = path.join(state, 'config.json');
const args = process.argv.slice(2);
const option = (name) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const hasOption = (name) => args.some((arg) => arg.startsWith(`--${name}=`));
let stateLock;
const run = (command, commandArgs) =>
    execFileSync(command, commandArgs, {
        cwd: root,
        stdio: 'inherit',
        env: stateLock
            ? { ...process.env, KEEPERD_LOCK_TOKEN: stateLock.token }
            : process.env,
    });
const node = (file, extra = []) =>
    run(process.execPath, [path.join(root, 'tools/local-erd', file), ...extra]);

if (args.includes('--help')) {
    console.log(
        `${localCommand('init')}${process.env.KEEPERD_CLI === '1' ? '' : ' --'} [--local=/absolute/clone/path] [--branch=main] [--rebuild]\nGitHub 저장소는 화면에서 선택한 뒤 Sync하세요.`
    );
    process.exit(0);
}

try {
    if (hasOption('repository'))
        throw new Error(
            `GitHub 저장소는 ${localCommand('start')} 화면에서 선택한 뒤 Sync하세요.`
        );
    stateLock = acquireStateLock(state, { command: 'init' });
    const local = hasOption('local')
        ? registerLocalRepository(option('local'))
        : null;
    console.log('로컬 ERD 최초 설정을 시작합니다. 완료한 단계는 재사용합니다.');
    for (const [command, commandArgs, hint] of [
        ['git', ['--version'], 'Git을 설치하세요.'],
        ...(!local
            ? [
                  [
                      'gh',
                      ['auth', 'status'],
                      'GitHub CLI를 설치하고 gh auth login, gh auth setup-git을 실행하세요.',
                  ],
              ]
            : []),
        [
            'docker',
            ['info', '--format', '{{.ServerVersion}}'],
            'Docker를 설치하고 실행하세요.',
        ],
    ]) {
        try {
            run(command, commandArgs);
        } catch {
            throw new Error(hint);
        }
    }
    let config;
    let repositoryUrl;
    if (existsSync(configFile)) {
        config = JSON.parse(readFileSync(configFile, 'utf8'));
        const requested = local?.repositoryUrl ?? config.repositoryUrl;
        repositoryUrl = requested ? canonicalRepository(requested) : undefined;
        console.log(`기존 전역 설정 재사용: ${state}`);
    } else {
        const url = local?.repositoryUrl;
        repositoryUrl = url ? canonicalRepository(url) : undefined;
        config = repositoryUrl ? { repositoryUrl } : {};
        mkdirSync(state, { recursive: true, mode: 0o700 });
        writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', {
            flag: 'wx',
        });
    }
    if (local) {
        config.localRepositories = [
            ...(config.localRepositories ?? []).filter(
                (r) => r.id !== local.id
            ),
            local,
        ];
        writeFileSync(configFile, JSON.stringify(config, null, 2));
    }
    let branch = option('branch');
    if (branch) validateBranch(branch);
    const snapshotFile = path.join(state, 'data/snapshots.json');
    const snapshots =
        repositoryUrl && existsSync(snapshotFile)
            ? JSON.parse(readFileSync(snapshotFile, 'utf8')).snapshots.filter(
                  (s) =>
                      canonicalRepository(
                          s.repositoryUrl ?? config.repositoryUrl
                      ) === (local?.repositoryUrl ?? repositoryUrl) &&
                      (local
                          ? s.source?.kind === 'local' &&
                            s.source.repositoryId === local.id &&
                            s.source.mode === 'commit'
                          : s.source?.kind !== 'local')
              )
            : [];
    if (
        repositoryUrl &&
        (!snapshots.length ||
            (branch && !snapshots.some((s) => s.branch === branch)))
    ) {
        const branches = local
            ? localBranches(local).branches
            : await listBranches(repositoryUrl);
        branch ??= branches.includes('develop')
            ? 'develop'
            : branches.includes('main')
              ? 'main'
              : branches[0];
        if (!branch || !branches.includes(branch))
            throw new Error(
                local
                    ? '지정한 브랜치가 로컬에 없습니다.'
                    : '지정한 브랜치가 GitHub에 없습니다.'
            );
        console.log(
            `최초 스키마 생성: ${branch} (다른 브랜치는 화면에서 Sync하세요)`
        );
    } else if (repositoryUrl) {
        branch = undefined;
        console.log('기존 스냅샷 재사용');
    } else {
        branch = undefined;
        console.log('저장소는 화면에서 선택한 뒤 Sync하세요.');
    }
    const shouldBuild = !hasCurrentBuild(root) || args.includes('--rebuild');
    if (
        shouldBuild &&
        (!existsSync(path.join(root, 'node_modules/typescript/bin/tsc')) ||
            args.includes('--rebuild'))
    )
        run(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
            'ci',
            '--ignore-scripts',
        ]);
    if (branch)
        node('sync.mjs', [
            `--branch=${branch}`,
            ...(!local ? [`--repository=${repositoryUrl}`] : []),
            ...(local ? [`--local=${local.id}`] : []),
        ]);
    if (shouldBuild) {
        node('build.mjs');
    } else console.log('기존 로컬 빌드 재사용');
    console.log(
        `\n준비 완료! ${localCommand('start')} 실행 후 http://localhost:18777/ 을 브라우저에서 여세요.`
    );
} catch (error) {
    console.error(
        `\n초기화 실패: ${error.message}\n문제를 해결한 뒤 ${localCommand('init')}을 다시 실행하세요.`
    );
    process.exitCode = 1;
} finally {
    stateLock?.release();
}
