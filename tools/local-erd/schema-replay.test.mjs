import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    airflowProfile,
    flywayDockerArguments,
    flywayProfile,
    selectSchemaSource,
    supportedSchemaMethods,
} from './schema-replay.mjs';
import { airflowDockerArguments } from './airflow-replay.mjs';

const backend = 'https://github.com/NangmanAzit/myhouse-agent-backend.git';
const airflowRepository =
    'https://github.com/NangmanAzit/nangmanazit-data-airflow.git';

const airflowInput = ({
    airflowVersion = '3.3.1',
    pythonVersion = '3.12',
    authManager = 'airflow.providers.fab.auth_manager.fab_auth_manager.FabAuthManager',
} = {}) =>
    new Map([
        [
            'Dockerfile',
            `ARG AIRFLOW_VERSION=${airflowVersion}\nARG PYTHON_VERSION=${pythonVersion}\nFROM apache/airflow:\${AIRFLOW_VERSION}-python\${PYTHON_VERSION} AS runtime\n`,
        ],
        [
            'docker-compose.yml',
            `AIRFLOW_VERSION: \${AIRFLOW_VERSION:-${airflowVersion}}\nPYTHON_VERSION: \${PYTHON_VERSION:-${pythonVersion}}\nAIRFLOW__CORE__AUTH_MANAGER: ${authManager}\n`,
        ],
        [
            '.env.example',
            `AIRFLOW_VERSION=${airflowVersion}\nPYTHON_VERSION=${pythonVersion}\n`,
        ],
    ]);

test('selects the repository-defined Airflow metadata database version', () => {
    const source = selectSchemaSource(airflowInput(), airflowRepository);
    assert.equal(source.kind, 'airflow-metadata');
    assert.equal(source.label, 'Airflow 메타 DB');
    assert.equal(
        source.profile.airflowImage,
        'apache/airflow:3.3.1-python3.12'
    );
    assert.deepEqual(source.files, [
        'Dockerfile',
        'docker-compose.yml',
        '.env.example',
    ]);
});

test('rejects missing, inconsistent, and unsupported Airflow versions', () => {
    const missing = airflowInput();
    missing.delete('.env.example');
    assert.throws(() => selectSchemaSource(missing, airflowRepository), {
        code: 'SCHEMA_CONFIGURATION_MISSING',
    });
    const unsupported = airflowInput({ airflowVersion: '3.4.0' });
    assert.throws(() => selectSchemaSource(unsupported, airflowRepository), {
        code: 'SCHEMA_VERSION_UNSUPPORTED',
    });
    const inconsistent = airflowInput();
    inconsistent.set(
        '.env.example',
        'AIRFLOW_VERSION=3.3.0\nPYTHON_VERSION=3.12\n'
    );
    assert.throws(() => selectSchemaSource(inconsistent, airflowRepository), {
        code: 'SCHEMA_VERSION_UNSUPPORTED',
    });
});

test('runs only Airflow metadata migration in the isolated database namespace', () => {
    const profile = {
        ...airflowProfile(airflowRepository),
        airflowVersion: '3.3.1',
        pythonVersion: '3.12',
        airflowImage: 'apache/airflow:3.3.1-python3.12',
    };
    const args = airflowDockerArguments({
        profile,
        container: 'keeperd-postgres',
        database: 'airflow_metadata',
    });
    assert.ok(args.includes('container:keeperd-postgres'));
    assert.ok(args.includes('--read-only'));
    assert.ok(args.includes('apache/airflow:3.3.1-python3.12'));
    assert.deepEqual(args.slice(-2), ['db', 'migrate']);
    assert.doesNotMatch(
        args.join(' '),
        /dags (?:test|trigger|backfill)|scheduler|batch|collector|docker\.sock/
    );
});

test('selects configured Flyway SQL without lexicographically defining execution order', () => {
    const source = selectSchemaSource(
        [
            'src/main/resources/db/migration/V2__base.sql',
            'src/main/resources/db/migration/V10__later.sql',
            'src/main/resources/db/migration/R__view.sql',
        ],
        backend
    );
    assert.equal(source.kind, 'flyway');
    assert.equal(source.profile.defaultSchema, 'myhouse_agent');
    assert.match(source.profile.initSql, /myhouse_agent/);
    const batch = selectSchemaSource(
        ['src/main/resources/db/migration/V3__pipeline.sql'],
        'https://github.com/NangmanAzit/nangmanazit-data-batch.git'
    );
    assert.equal(batch.profile.defaultSchema, 'public');
    assert.equal(batch.profile.initSql, undefined);
});

test('builds an isolated official Flyway invocation without application runners or Docker socket', () => {
    const args = flywayDockerArguments({
        profile: flywayProfile(backend),
        network: 'keeperd-test',
        databaseHost: 'postgres-test',
        database: 'schema_test',
        migrationDirectory: '/tmp/migrations',
    });
    assert.equal(args[0], 'run');
    assert.ok(args.includes('redgate/flyway:11.7.2-alpine'));
    assert.ok(args.includes('-defaultSchema=myhouse_agent'));
    assert.ok(args.includes('migrate'));
    assert.doesNotMatch(args.join(' '), /bootRun|gradle|batch|docker\.sock/);
});

test('distinguishes missing source, unconfigured Flyway, and configured path errors', () => {
    assert.throws(() => selectSchemaSource(['README.md']), {
        code: 'SCHEMA_SOURCE_NOT_FOUND',
    });
    assert.throws(
        () =>
            selectSchemaSource([
                'src/main/resources/db/migration/V1__init.sql',
            ]),
        { code: 'SCHEMA_METHOD_UNSUPPORTED' }
    );
    assert.throws(() => selectSchemaSource(['README.md'], backend), {
        code: 'SCHEMA_CONFIGURATION_MISSING',
    });
    try {
        selectSchemaSource(['README.md']);
    } catch (error) {
        assert.match(error.message, /현재 지원 방식:/);
        for (const method of supportedSchemaMethods)
            assert.match(error.message, new RegExp(method.split(' ')[0]));
    }
});

test('selects configured Alembic revisions and requires config and env files', () => {
    const repository = 'https://github.com/NangmanAzit/myhouse-backend.git';
    const source = selectSchemaSource(
        [
            'alembic.ini',
            'alembic/env.py',
            'alembic/versions/b629f23b536e_initial_schema.py',
            'alembic/versions/7f4b1d2c9a30_require_user_basic_information.py',
        ],
        repository
    );
    assert.equal(source.kind, 'alembic');
    assert.equal(source.profile.schema, 'myhouse');
    assert.equal(source.revisions.length, 2);
    assert.throws(
        () =>
            selectSchemaSource(
                ['alembic/versions/b629f23b536e_initial_schema.py'],
                repository
            ),
        { code: 'SCHEMA_CONFIGURATION_MISSING' }
    );
    assert.throws(
        () =>
            selectSchemaSource(['alembic.ini', 'alembic/versions/revision.py']),
        { code: 'SCHEMA_METHOD_UNSUPPORTED' }
    );
});
