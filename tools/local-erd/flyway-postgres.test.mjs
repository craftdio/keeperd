import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { flywayDockerArguments, flywayProfile } from './schema-replay.mjs';

test(
    'official Flyway orders V2 before V10, applies repeatables, and initializes the configured schema',
    { skip: process.env.LOCAL_ERD_FLYWAY_TEST !== '1', timeout: 300000 },
    async () => {
        const suffix = process.pid.toString(36);
        const postgres = `keeperd-flyway-pg-${suffix}`;
        const migrations = mkdtempSync(
            path.join(tmpdir(), 'keeperd-flyway-migrations-')
        );
        const docker = (...args) =>
            execFileSync('docker', args, {
                encoding: 'utf8',
                timeout: 240000,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        try {
            writeFileSync(
                path.join(migrations, 'V2__base.sql'),
                'CREATE TABLE migration_order(position integer PRIMARY KEY); INSERT INTO migration_order VALUES (2);'
            );
            writeFileSync(
                path.join(migrations, 'V10__later.sql'),
                'INSERT INTO migration_order VALUES (10);'
            );
            writeFileSync(
                path.join(migrations, 'R__current_order.sql'),
                'CREATE OR REPLACE VIEW current_order AS SELECT max(position) AS position FROM migration_order;'
            );
            docker(
                'run',
                '-d',
                '--rm',
                '--name',
                postgres,
                '--network',
                'none',
                '-e',
                'POSTGRES_HOST_AUTH_METHOD=trust',
                'postgres:17-alpine'
            );
            for (let attempt = 0; attempt < 60; attempt++) {
                try {
                    docker('exec', postgres, 'pg_isready', '-U', 'postgres');
                    break;
                } catch (error) {
                    if (attempt === 59) throw error;
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
            docker('exec', postgres, 'createdb', '-U', 'postgres', 'fixture');
            docker(
                ...flywayDockerArguments({
                    profile: flywayProfile(
                        'https://github.com/NangmanAzit/myhouse-agent-backend.git'
                    ),
                    network: `container:${postgres}`,
                    databaseHost: 'localhost',
                    database: 'fixture',
                    migrationDirectory: migrations,
                })
            );
            const result = docker(
                'exec',
                postgres,
                'psql',
                '-U',
                'postgres',
                '-d',
                'fixture',
                '-qAt',
                '-c',
                "SELECT current_schema(), string_agg(position::text, ',' ORDER BY position), (SELECT position FROM myhouse_agent.current_order), (SELECT count(*) FROM myhouse_agent.flyway_schema_history WHERE type='SQL' AND success) FROM myhouse_agent.migration_order;"
            ).trim();
            assert.equal(result, 'public|2,10|10|3');
        } finally {
            try {
                docker('stop', postgres);
            } catch {
                /* Container may not have started. */
            }
            rmSync(migrations, { recursive: true, force: true });
        }
    }
);
