import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    readdirSync,
} from 'node:fs';
import path from 'node:path';
import {
    canonicalRepository,
    diagramKey,
    mergeSnapshots,
    repositoryKey,
} from './branches.mjs';
import { publishFiles } from './atomic-publish.mjs';
import { acquireStateLock } from './state-lock.mjs';
import { stateDirectory } from './state-paths.mjs';

const args = process.argv.slice(2);
const fromIndex = args.indexOf('--from');
const fromArgument = args.find((arg) => arg.startsWith('--from='))?.slice(7);
const source = path.resolve(
    fromArgument ?? (fromIndex >= 0 ? (args[fromIndex + 1] ?? '') : '')
);
const target = stateDirectory();

if (args.includes('--help') || (!fromArgument && fromIndex < 0)) {
    console.log('npm run local:migrate -- --from=/absolute/path/to/.local-erd');
    process.exit(args.includes('--help') ? 0 : 1);
}
if (!path.isAbsolute(fromArgument ?? args[fromIndex + 1] ?? ''))
    throw new Error('--from에는 기존 .local-erd의 절대 경로를 지정하세요.');
if (source === target)
    throw new Error('가져올 경로와 KeepERD 전역 데이터 경로가 같습니다.');

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const sourceConfigFile = path.join(source, 'config.json');
const sourceSnapshotsFile = path.join(source, 'data', 'snapshots.json');
if (!existsSync(sourceConfigFile) || !existsSync(sourceSnapshotsFile))
    throw new Error(
        '기존 config.json과 data/snapshots.json을 찾을 수 없습니다.'
    );

const lock = acquireStateLock(target, { command: 'migrate' });
try {
    const sourceConfig = readJson(sourceConfigFile);
    const targetConfigFile = path.join(target, 'config.json');
    const targetSnapshotsFile = path.join(target, 'data', 'snapshots.json');
    const targetConfig = existsSync(targetConfigFile)
        ? readJson(targetConfigFile)
        : { repositoryUrl: canonicalRepository(sourceConfig.repositoryUrl) };
    if (!targetConfig.repositoryUrl)
        targetConfig.repositoryUrl = canonicalRepository(
            sourceConfig.repositoryUrl
        );
    const previous = existsSync(targetSnapshotsFile)
        ? readJson(targetSnapshotsFile).snapshots
        : [];
    const imported = readJson(sourceSnapshotsFile).snapshots.map((snapshot) => {
        const repositoryUrl = canonicalRepository(
            snapshot.repositoryUrl ?? sourceConfig.repositoryUrl
        );
        if (snapshot.source?.kind === 'local')
            return { ...snapshot, repositoryUrl };
        const diagram = {
            ...snapshot.diagram,
            id: `debut-${diagramKey(repositoryUrl, snapshot.branch, targetConfig.repositoryUrl)}`,
        };
        return { ...snapshot, repositoryUrl, diagram };
    });
    const localRepositories = new Map(
        (targetConfig.localRepositories ?? []).map((repo) => [repo.id, repo])
    );
    for (const repo of sourceConfig.localRepositories ?? [])
        localRepositories.set(repo.id, repo);
    const config = {
        ...targetConfig,
        repositoryUrl: canonicalRepository(targetConfig.repositoryUrl),
        ...(localRepositories.size
            ? { localRepositories: [...localRepositories.values()] }
            : {}),
    };
    const snapshots = mergeSnapshots(previous, imported);
    mkdirSync(path.join(target, 'data'), { recursive: true });
    publishFiles([
        {
            target: targetConfigFile,
            content: JSON.stringify(config, null, 2) + '\n',
        },
        ...imported.map((snapshot) => ({
            target: path.join(
                target,
                'data',
                `${snapshot.diagram.id.replace(/^debut-/, '')}.chartdb.json`
            ),
            content: JSON.stringify(snapshot.diagram, null, 2),
        })),
        {
            target: targetSnapshotsFile,
            content:
                JSON.stringify(
                    { generatedAt: new Date().toISOString(), snapshots },
                    null,
                    2
                ) + '\n',
        },
    ]);

    const legacyRepository = path.join(source, 'repository');
    const repositoryTarget = path.join(
        target,
        'repositories',
        repositoryKey(sourceConfig.repositoryUrl),
        'repository'
    );
    if (existsSync(legacyRepository) && !existsSync(repositoryTarget)) {
        mkdirSync(path.dirname(repositoryTarget), { recursive: true });
        cpSync(legacyRepository, repositoryTarget, { recursive: true });
    }
    const legacyRepositories = path.join(source, 'repositories');
    if (existsSync(legacyRepositories)) {
        for (const entry of readdirSync(legacyRepositories, {
            withFileTypes: true,
        })) {
            if (!entry.isDirectory()) continue;
            const sourceCache = path.join(legacyRepositories, entry.name);
            const targetCache = path.join(target, 'repositories', entry.name);
            if (existsSync(targetCache)) continue;
            mkdirSync(path.dirname(targetCache), { recursive: true });
            cpSync(sourceCache, targetCache, { recursive: true });
        }
    }
    console.log(
        `${source}에서 스냅샷 ${imported.length}개와 로컬 저장소 등록 ${sourceConfig.localRepositories?.length ?? 0}개를 가져왔습니다.`
    );
    console.log(`기존 데이터는 삭제하지 않았습니다: ${source}`);
} finally {
    lock.release();
}
