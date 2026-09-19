import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    existsSync,
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('explicitly imports legacy state without deleting the source', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'keeperd-migrate-'));
    const source = path.join(root, 'checkout', '.local-erd');
    const target = path.join(root, 'KeepERD');
    try {
        mkdirSync(path.join(source, 'data'), { recursive: true });
        const repositoryUrl = 'https://github.com/example/backend.git';
        writeFileSync(
            path.join(source, 'config.json'),
            JSON.stringify({ repositoryUrl })
        );
        writeFileSync(
            path.join(source, 'data', 'snapshots.json'),
            JSON.stringify({
                snapshots: [
                    {
                        branch: 'main',
                        diagram: { id: 'debut-main', tables: [] },
                        revision: 'abc',
                    },
                ],
            })
        );
        const result = spawnSync(
            process.execPath,
            [
                fileURLToPath(new URL('migrate.mjs', import.meta.url)),
                `--from=${source}`,
            ],
            {
                encoding: 'utf8',
                env: { ...process.env, KEEPERD_STATE_DIR: target },
            }
        );
        assert.equal(result.status, 0, result.stderr);
        const config = JSON.parse(
            readFileSync(path.join(target, 'config.json'), 'utf8')
        );
        assert.equal(config.repositoryUrl, repositoryUrl);
        const snapshots = JSON.parse(
            readFileSync(path.join(target, 'data', 'snapshots.json'), 'utf8')
        ).snapshots;
        assert.equal(snapshots[0].repositoryUrl, repositoryUrl);
        assert.equal(snapshots[0].diagram.id, 'debut-main');
        assert.ok(existsSync(path.join(target, 'data', 'main.chartdb.json')));
        assert.ok(existsSync(path.join(source, 'config.json')));
        assert.match(result.stdout, /기존 데이터는 삭제하지 않았습니다/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
