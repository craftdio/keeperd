import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
    diagramKey,
    repositoryKey,
    repositorySlug,
    canonicalRepository,
    validateBranch,
    mergeSnapshots,
} from './branches.mjs';
import {
    resolveLocalRepository,
    captureLocalSource,
    captureLocalCommit,
    localComparisonBase,
    LocalSourceError,
    selectSchemaSource,
} from './local-source.mjs';
import { findSchemaAdditions } from './schema-diff.js';
import { publishFiles } from './atomic-publish.mjs';
import { stateDirectory } from './state-paths.mjs';
import { acquireStateLock, StateLockError } from './state-lock.mjs';
import { localCommand } from './cli-command.mjs';

async function sync(state) {
    const root = path.dirname(fileURLToPath(import.meta.url));
    const configFile = path.join(state, 'config.json');
    if (!existsSync(configFile))
        throw new Error(
            `KeepERD 전역 설정이 없습니다. 먼저 ${localCommand('init')}을 실행하세요.`
        );
    const config = JSON.parse(readFileSync(configFile, 'utf8'));
    const localArg = process.argv.find((arg) => arg.startsWith('--local='));
    const localId = localArg?.slice(8);
    const localRepo = localArg ? resolveLocalRepository(config, localId) : null;
    const localMode = process.argv.includes('--worktree')
        ? 'worktree'
        : 'commit';
    const remoteCheckArg = process.argv.find((arg) =>
        arg.startsWith('--remote-check=')
    );
    const remoteCheck = remoteCheckArg
        ? JSON.parse(
              Buffer.from(remoteCheckArg.slice(15), 'base64url').toString()
          )
        : null;
    let primaryUrl;
    try {
        primaryUrl = config.repositoryUrl
            ? canonicalRepository(config.repositoryUrl)
            : undefined;
    } catch {
        throw new Error(
            'repositoryUrl은 인증정보가 없는 GitHub HTTPS 저장소 URL이어야 합니다.'
        );
    }
    const requestedRepository =
        process.argv
            .slice(2)
            .find((arg) => arg.startsWith('--repository='))
            ?.slice(13) ?? primaryUrl;
    if (!localRepo && !requestedRepository)
        throw new Error(
            '동기화할 GitHub 저장소가 없습니다. --repository=GitHub_URL을 지정하세요.'
        );
    const repositoryUrl =
        localRepo?.repositoryUrl ?? canonicalRepository(requestedRepository);
    const primary = repositoryUrl === primaryUrl;
    const repo = path.join(
        state,
        'repositories',
        repositoryKey(repositoryUrl),
        'repository'
    );
    const data = path.join(state, 'data');
    const target = path.join(data, 'snapshots.json');
    const previous = existsSync(target)
        ? JSON.parse(readFileSync(target, 'utf8')).snapshots.map(
              (snapshot) => ({
                  ...snapshot,
                  repositoryUrl: snapshot.repositoryUrl ?? primaryUrl,
              })
          )
        : [];
    const run = (cmd, args, input) =>
        execFileSync(cmd, args, {
            input,
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            timeout: 120000,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
    const git = (...args) => run('git', ['-C', repo, ...args]);
    const id = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);
    const container = `debut-erd-extract-${process.pid}`;
    const now = new Date().toISOString();
    const epoch = Date.parse(now);
    mkdirSync(data, { recursive: true });
    mkdirSync(path.dirname(repo), { recursive: true });
    if (!localRepo && !existsSync(path.join(repo, '.git')))
        run('git', ['clone', '--', repositoryUrl, repo]);
    if (
        !localRepo &&
        canonicalRepository(git('remote', 'get-url', 'origin').trim()) !==
            repositoryUrl
    )
        throw new Error(
            'KeepERD 캐시의 origin이 요청한 GitHub 저장소와 다릅니다. 해당 캐시 폴더를 확인하세요.'
        );
    const selected = process.argv
        .slice(2)
        .filter((arg) => arg.startsWith('--branch='));
    const branches = selected.length
        ? [...new Set(selected.map((arg) => validateBranch(arg.slice(9))))]
        : ['develop', 'main'];
    if (!localRepo && !process.argv.includes('--offline')) {
        git(
            'fetch',
            'origin',
            ...branches.map((b) => `+refs/heads/${b}:refs/remotes/origin/${b}`)
        );
        for (const candidate of ['develop', 'main'].filter(
            (branch) => !branches.includes(branch)
        )) {
            try {
                git(
                    'fetch',
                    'origin',
                    `+refs/heads/${candidate}:refs/remotes/origin/${candidate}`
                );
            } catch {
                /* A repository does not have to use both conventional bases. */
            }
        }
    }
    const captures = localRepo
        ? new Map(
              branches.map((b) => [
                  b,
                  captureLocalSource(localRepo, b, localMode),
              ])
          )
        : null;
    const revisions = captures
        ? Object.fromEntries(
              [...captures].map(([branch, input]) => [branch, input.sha])
          )
        : Object.fromEntries(
              branches.map((b) => [
                  b,
                  git(
                      'rev-parse',
                      '--verify',
                      `refs/remotes/origin/${b}^{commit}`
                  ).trim(),
              ])
          );
    const remoteCapture = (revision) => {
        const files = new Map();
        for (const directory of ['db/schema', 'db/migration']) {
            const names = git(
                'ls-tree',
                '-r',
                '--name-only',
                revision,
                directory
            )
                .trim()
                .split('\n')
                .filter((name) => name.endsWith('.sql'));
            for (const name of names)
                files.set(name, git('show', `${revision}:${name}`));
        }
        return {
            sha: revision,
            files,
            schemaSource: selectSchemaSource(files),
        };
    };
    const remoteComparisonBase = (branch) => {
        const selectedRef = `refs/remotes/origin/${branch}`;
        const candidates = ['develop', 'main'].filter(
            (candidate) => candidate !== branch
        );
        const matches = [];
        for (const candidate of candidates) {
            const candidateRef = `refs/remotes/origin/${candidate}`;
            try {
                git('rev-parse', '--verify', `${candidateRef}^{commit}`);
                const commit = git(
                    'merge-base',
                    selectedRef,
                    candidateRef
                ).trim();
                if (!commit) continue;
                const distance = Number(
                    git(
                        'rev-list',
                        '--count',
                        `${commit}..${selectedRef}`
                    ).trim()
                );
                matches.push({ branch: candidate, commit, distance });
            } catch {
                /* Missing or unrelated candidates cannot be a comparison base. */
            }
        }
        return matches.sort(
            (a, b) =>
                a.distance - b.distance ||
                candidates.indexOf(a.branch) - candidates.indexOf(b.branch)
        )[0];
    };
    const comparisonBases = new Map(
        branches.map((branch) => [
            branch,
            localRepo
                ? localComparisonBase(localRepo, branch)
                : remoteComparisonBase(branch),
        ])
    );
    const snapshots = [];
    let started = false;
    try {
        run('docker', [
            'run',
            '-d',
            '--rm',
            '--name',
            container,
            '--network',
            'none',
            '--memory=512m',
            '--cpus=1',
            '--pids-limit=128',
            '-e',
            'POSTGRES_HOST_AUTH_METHOD=trust',
            'postgres:17-alpine',
        ]);
        started = true;
        for (let i = 0; ; i++) {
            try {
                run('docker', [
                    'exec',
                    container,
                    'pg_isready',
                    '-U',
                    'postgres',
                ]);
                break;
            } catch {
                if (i === 59) throw new Error('PostgreSQL 시작 시간 초과');
                await new Promise((r) => setTimeout(r, 1000));
            }
        }
        for (const [branchIndex, branch] of branches.entries()) {
            const input = captures?.get(branch);
            if (input && remoteCheck?.commit === input.sha) {
                input.source.remoteStatus = remoteCheck.remoteStatus;
                input.source.checkedAt = remoteCheck.checkedAt;
                if (localMode === 'commit')
                    input.source.notice =
                        remoteCheck.remoteStatus === 'unpublished'
                            ? '원격 GitHub의 같은 이름 브랜치에 반영되지 않은 로컬 변경입니다.'
                            : ['same', 'behind'].includes(
                                    remoteCheck.remoteStatus
                                )
                              ? '확인 시점의 원격 브랜치에 포함된 로컬 커밋입니다.'
                              : input.source.notice;
            }
            const key =
                input?.key ?? diagramKey(repositoryUrl, branch, primaryUrl);
            const namespace = input
                ? `${key}:`
                : primary
                  ? ''
                  : `${repositoryKey(repositoryUrl)}:`;
            const sha = revisions[branch];
            const replayInput = input ?? remoteCapture(sha);
            const schemaSource = replayInput.schemaSource;
            const files = schemaSource.files;
            run('docker', [
                'exec',
                container,
                'createdb',
                '-U',
                'postgres',
                key,
            ]);
            for (const [index, file] of files.entries()) {
                console.log(
                    `PROGRESS ${Math.round(10 + (80 * (branchIndex + index / files.length)) / branches.length)} ${branch} ${schemaSource.label} 재현 중 · ${index + 1}/${files.length}`
                );
                try {
                    run(
                        'docker',
                        [
                            'exec',
                            '-i',
                            container,
                            'psql',
                            '-X',
                            '-q',
                            '-v',
                            'ON_ERROR_STOP=1',
                            '-U',
                            'postgres',
                            '-d',
                            key,
                        ],
                        replayInput.files.get(file)
                    );
                } catch (error) {
                    throw new Error(
                        `${branch}: ${schemaSource.label} ${file} 적용 실패`,
                        { cause: error }
                    );
                }
            }
            const raw = JSON.parse(
                run(
                    'docker',
                    [
                        'exec',
                        '-i',
                        container,
                        'psql',
                        '-X',
                        '-qAt',
                        '-v',
                        'ON_ERROR_STOP=1',
                        '-U',
                        'postgres',
                        '-d',
                        key,
                    ],
                    readFileSync(path.join(root, 'introspect.sql'), 'utf8')
                )
            );
            const comparisonBase = comparisonBases.get(branch);
            let baseDiagram = null;
            let comparison = comparisonBase
                ? {
                      kind: 'branch-base',
                      branch: comparisonBase.branch,
                      revision: comparisonBase.commit,
                  }
                : {
                      kind: 'unavailable',
                      reason: 'develop/main 공통 기준 커밋을 찾지 못했습니다.',
                  };
            if (comparisonBase) {
                try {
                    const baseInput = localRepo
                        ? captureLocalCommit(localRepo, comparisonBase.commit)
                        : remoteCapture(comparisonBase.commit);
                    const baseDatabase = `${key}_base`;
                    run('docker', [
                        'exec',
                        container,
                        'createdb',
                        '-U',
                        'postgres',
                        baseDatabase,
                    ]);
                    for (const file of baseInput.schemaSource.files)
                        run(
                            'docker',
                            [
                                'exec',
                                '-i',
                                container,
                                'psql',
                                '-X',
                                '-q',
                                '-v',
                                'ON_ERROR_STOP=1',
                                '-U',
                                'postgres',
                                '-d',
                                baseDatabase,
                            ],
                            baseInput.files.get(file)
                        );
                    const baseRaw = JSON.parse(
                        run(
                            'docker',
                            [
                                'exec',
                                '-i',
                                container,
                                'psql',
                                '-X',
                                '-qAt',
                                '-v',
                                'ON_ERROR_STOP=1',
                                '-U',
                                'postgres',
                                '-d',
                                baseDatabase,
                            ],
                            readFileSync(
                                path.join(root, 'introspect.sql'),
                                'utf8'
                            )
                        )
                    );
                    baseDiagram = {
                        tables: baseRaw.tables.map((table) => ({
                            schema: table.schema,
                            name: table.name,
                            fields: baseRaw.columns
                                .filter((column) => column.oid === table.oid)
                                .map((column) => ({
                                    name: column.name,
                                    type: { name: column.type },
                                    primaryKey: column.pk,
                                    unique: column.unique,
                                    nullable: column.nullable,
                                    increment: column.increment,
                                    default: column.default,
                                })),
                        })),
                    };
                } catch {
                    comparison = {
                        ...comparison,
                        kind: 'unavailable',
                        reason: `${comparisonBase.branch} 공통 기준 스키마를 재현하지 못했습니다.`,
                    };
                }
            }
            const tid = (oid) =>
                id(
                    `${namespace}${branch}:table:${raw.tables.find((t) => t.oid === oid)?.schema}.${raw.tables.find((t) => t.oid === oid)?.name}`
                );
            const fid = (oid, num) =>
                id(
                    `${tid(oid)}:field:${raw.columns.find((c) => c.oid === oid && c.num === num)?.name}`
                );
            const domains = new Map();
            const domainFiles = [...replayInput.files.keys()].filter((f) =>
                f.startsWith('db/schema/')
            );
            for (const file of domainFiles) {
                for (const match of replayInput.files
                    .get(file)
                    .matchAll(
                        /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([\w".]+)/gi
                    )) {
                    const name = match[1].replaceAll('"', '');
                    domains.set(
                        name.includes('.') ? name : `public.${name}`,
                        path.basename(file, '.sql').replace(/^\d+_/, '')
                    );
                }
            }
            const groups = new Map();
            const palette = [
                '#6366f1',
                '#10b981',
                '#f59e0b',
                '#ec4899',
                '#06b6d4',
                '#8b5cf6',
            ];
            const tables = raw.tables.map((t) => {
                const group = domains.get(`${t.schema}.${t.name}`) ?? t.schema;
                if (!groups.has(group))
                    groups.set(group, { index: groups.size, count: 0 });
                const g = groups.get(group),
                    slot = g.count++;
                return {
                    id: tid(t.oid),
                    name: t.name,
                    schema: t.schema,
                    x: g.index * 900 + (slot % 2) * 400,
                    y: Math.floor(slot / 2) * 1100 + 80,
                    color: palette[g.index % palette.length],
                    isView: ['v', 'm'].includes(t.relkind),
                    isMaterializedView: t.relkind === 'm',
                    createdAt: epoch,
                    width: 337,
                    comments: t.comments,
                    fields: raw.columns
                        .filter((c) => c.oid === t.oid)
                        .map((c) => ({
                            id: fid(t.oid, c.num),
                            name: c.name,
                            type: {
                                id: c.type.replaceAll(' ', '_'),
                                name: c.type,
                            },
                            primaryKey: c.pk,
                            unique: c.unique,
                            nullable: c.nullable,
                            increment: c.increment,
                            default: c.default,
                            comments: c.comments,
                            createdAt: epoch,
                        })),
                    indexes: raw.indexes
                        .filter((i) => i.oid === t.oid)
                        .map((i) => ({
                            id: id(`${tid(t.oid)}:index:${i.name}`),
                            name: i.name,
                            unique: i.unique,
                            isPrimaryKey: i.pk,
                            type: i.type,
                            fieldIds: i.fields
                                .filter((n) => n > 0)
                                .map((n) => fid(t.oid, n)),
                            comments: i.definition,
                            createdAt: epoch,
                        })),
                    checkConstraints: raw.checks
                        .filter((c) => c.oid === t.oid)
                        .map((c) => ({
                            id: id(`${tid(t.oid)}:check:${c.name}`),
                            expression: c.expression,
                            createdAt: epoch,
                        })),
                };
            });
            const areas = [],
                laneY = [0, 0, 0];
            for (const [name, g] of groups) {
                const lane = laneY.indexOf(Math.min(...laneY)),
                    x = lane * 920,
                    y = laneY[lane];
                const areaId = id(`${namespace}${branch}:area:${name}`),
                    heights = [y + 80, y + 80];
                const members = tables.filter(
                    (t) =>
                        (domains.get(`${t.schema}.${t.name}`) ?? t.schema) ===
                        name
                );
                for (const t of members) {
                    const column = heights.indexOf(Math.min(...heights));
                    t.x = x + 35 + column * 420;
                    t.y = heights[column];
                    t.parentAreaId = areaId;
                    heights[column] += 150 + t.fields.length * 36;
                }
                const height = Math.max(...heights) - y + 35;
                areas.push({
                    id: areaId,
                    name,
                    x,
                    y,
                    width: 850,
                    height,
                    color: palette[g.index % palette.length],
                });
                laneY[lane] += height + 100;
            }
            const relationships = raw.foreignKeys.flatMap((k) =>
                k.sources.map((n, i) => ({
                    id: id(`${tid(k.source)}:fk:${k.name}:${i}`),
                    name: k.name,
                    sourceTableId: tid(k.source),
                    targetTableId: tid(k.target),
                    sourceFieldId: fid(k.source, n),
                    targetFieldId: fid(k.target, k.targets[i]),
                    sourceCardinality:
                        raw.columns.find(
                            (c) => c.oid === k.source && c.num === n
                        )?.unique && k.sources.length === 1
                            ? 'one'
                            : 'many',
                    targetCardinality: 'one',
                    createdAt: epoch,
                }))
            );
            const diagram = {
                id: `debut-${key}`,
                name: `${repositorySlug(repositoryUrl)} · ${branch}${input ? ` · 로컬 ${localMode === 'worktree' ? '작업 중' : '커밋'}` : ''}`,
                databaseType: 'postgresql',
                createdAt: now,
                updatedAt: now,
                tables,
                relationships,
                areas,
                notes: [],
            };
            for (const rel of relationships)
                if (
                    !tables.some(
                        (t) =>
                            t.id === rel.targetTableId &&
                            t.fields.some((f) => f.id === rel.targetFieldId)
                    )
                )
                    throw new Error('외래키 대상 누락');
            const schemaAdditions = baseDiagram
                ? findSchemaAdditions(baseDiagram, diagram)
                : {
                      newTableIds: [],
                      newFieldIds: [],
                      changedTableIds: [],
                      changedFieldIds: [],
                      removedTables: 0,
                      removedFields: 0,
                      allTablesNew: false,
                  };
            snapshots.push({
                repositoryUrl,
                branch,
                diagram,
                revision: input ? `${sha}:${input.fingerprint}` : sha,
                ...(input ? { source: input.source } : {}),
                schemaAdditions: {
                    ...schemaAdditions,
                    comparison,
                },
                schemaSource: {
                    kind: schemaSource.kind,
                    label: schemaSource.label,
                    path: schemaSource.path,
                    files: files.length,
                },
                migrations:
                    schemaSource.kind === 'sql-migrations' ? files.length : 0,
                tables: tables.length,
                relationships: relationships.length,
            });
            console.log(
                `${branch}: ${sha.slice(0, 8)}, ${tables.length} tables, ${relationships.length} relationships, ${schemaSource.label} ${files.length} files`
            );
        }
        // Publish only after every requested branch succeeds; retain other branches.
        console.log('PROGRESS 95 다이어그램 저장 중…');
        const manifest = JSON.stringify(
            {
                generatedAt: now,
                snapshots: mergeSnapshots(previous, snapshots),
            },
            null,
            2
        );
        publishFiles([
            ...snapshots.map((snapshot) => ({
                target: path.join(
                    data,
                    `${snapshot.diagram.id.replace(/^debut-/, '')}.chartdb.json`
                ),
                content: JSON.stringify(snapshot.diagram, null, 2),
            })),
            {
                target,
                content: manifest,
            },
        ]);
    } finally {
        if (started) run('docker', ['stop', container]);
    }
}
const state = stateDirectory();
let stateLock;
try {
    stateLock = acquireStateLock(state, { command: 'sync' });
    await sync(state);
} catch (error) {
    console.error(
        JSON.stringify({
            code:
                error instanceof LocalSourceError
                    ? error.code
                    : error instanceof StateLockError
                      ? 'KEEPERD_ALREADY_RUNNING'
                      : 'SYNC_FAILED',
            error:
                error instanceof LocalSourceError ||
                error instanceof StateLockError
                    ? error.message
                    : '스키마 재현에 실패했습니다. 선언 스키마 또는 마이그레이션과 실행 환경을 확인하세요. 기존 ERD는 유지됩니다.',
        })
    );
    process.exitCode = 1;
} finally {
    stateLock?.release();
}
