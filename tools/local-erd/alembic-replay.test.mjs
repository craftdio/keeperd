import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    alembicConfiguration,
    alembicDockerArguments,
    alembicEnvironment,
    alembicHeadRevisions,
    alembicRunnerDockerfile,
} from './alembic-replay.mjs';
import { alembicProfile } from './schema-replay.mjs';

const profile = alembicProfile(
    'https://github.com/NangmanAzit/myhouse-backend.git'
);

test('pins the minimal Alembic runner without application startup or Docker socket', () => {
    const dockerfile = alembicRunnerDockerfile(profile);
    assert.match(dockerfile, /python:3\.14-slim@sha256:/);
    assert.match(dockerfile, /alembic==1\.18\.4/);
    assert.match(dockerfile, /SQLAlchemy==2\.0\.51/);
    assert.doesNotMatch(dockerfile, /gunicorn|uvicorn|app\.main|docker\.sock/);
});

test('preserves every Alembic head so callers can reject ambiguous graphs', () => {
    assert.deepEqual(alembicHeadRevisions('abc123 (head)\ndef456 (head)\n'), [
        'abc123 (head)',
        'def456 (head)',
    ]);
    assert.deepEqual(alembicHeadRevisions('abc123 (head)\n'), [
        'abc123 (head)',
    ]);
});

test('uses a controlled online env and a read-only isolated runner', () => {
    const environment = alembicEnvironment(profile);
    assert.match(environment, /CREATE SCHEMA IF NOT EXISTS "myhouse"/);
    assert.match(environment, /version_table_schema="myhouse"/);
    assert.doesNotMatch(environment, /app\.|Base|target_metadata/);
    assert.match(
        alembicConfiguration(),
        /script_location = \/workspace\/alembic/
    );

    const args = alembicDockerArguments({
        profile,
        container: 'postgres-test',
        database: 'fixture',
        workspace: '/tmp/revisions',
        command: ['upgrade', 'head'],
    });
    assert.ok(args.includes('container:postgres-test'));
    assert.ok(args.includes('--read-only'));
    assert.ok(
        args.includes(
            'DATABASE_URL=postgresql+psycopg2://postgres@localhost:5432/fixture'
        )
    );
    assert.doesNotMatch(args.join(' '), /docker\.sock|myhouse-backend|\.env/);
});
