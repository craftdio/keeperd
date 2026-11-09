import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, cpus, totalmem } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openWorkspace } from './workspace-store.mjs';
import { performanceSnapshots } from './performance-fixture.mjs';

// Run the identical command on the base and implementation commits. Older
// stores ignore the optional projection/receipt and return their full snapshot.
const tables = Number(process.argv[2] ?? 100);
const diagrams = Number(process.argv[3] ?? 14);
const root = mkdtempSync(path.join(tmpdir(), 'keeperd-performance-'));
const store = openWorkspace(root);
try {
    const fixture = performanceSnapshots({ tables, diagrams });
    store.syncSnapshots(fixture);
    const scope = {
        kind: 'entity',
        diagramId: 'debut-perf-0',
        collection: 'tables',
        id: 'debut-perf-0-table-0',
    };
    const measure = (operation) => {
        const results = [];
        for (let i = 0; i < 6; i++) {
            const started = performance.now();
            const cpu = process.cpuUsage();
            const value = operation(i);
            const json = JSON.stringify(value);
            const used = process.cpuUsage(cpu);
            results.push({
                ms: +(performance.now() - started).toFixed(3),
                cpuMs: +((used.user + used.system) / 1000).toFixed(3),
                bytes: Buffer.byteLength(json),
            });
        }
        return results;
    };
    let revision = store.view().revision;
    const read = measure(() => store.view(scope));
    const write = measure((i) => {
        const result = store.mutate({
            revision,
            response: 'ack-v1',
            action: 'updateTable',
            params: {
                diagramId: scope.diagramId,
                id: scope.id,
                attributes: { x: 100 + i },
            },
        });
        revision = result.revision;
        return result;
    });
    const final = store.view();
    assert.equal(final.diagrams.length, diagrams);
    assert.equal(final.diagrams[0].tables.length, tables);
    assert.equal(final.diagrams[0].tables[0].x, 105);
    if (diagrams > 1) assert.equal(final.diagrams[1].tables[0].x, 105);
    console.log(
        JSON.stringify(
            {
                node: process.version,
                cpu: cpus()[0]?.model,
                logicalCpus: cpus().length,
                ramBytes: totalmem(),
                fixture: {
                    tables,
                    diagrams,
                    fieldsPerTable: 10,
                    relationshipsPerDiagram: tables - 1,
                    areas: 0,
                    notes: 0,
                },
                fullSnapshotBytes: Buffer.byteLength(JSON.stringify(final)),
                read,
                write,
            },
            null,
            2
        )
    );
} finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
}
