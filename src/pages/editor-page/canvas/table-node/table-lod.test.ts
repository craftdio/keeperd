import { describe, expect, it } from 'vitest';
import {
    getTableLevelOfDetail,
    getTableOverviewLabelScale,
    TABLE_OVERVIEW_ZOOM,
    TABLE_SILHOUETTE_ZOOM,
} from './table-lod';

describe('table level of detail', () => {
    it('switches to the overview below the readable field threshold', () => {
        expect(getTableLevelOfDetail(TABLE_OVERVIEW_ZOOM)).toBe('detail');
        expect(getTableLevelOfDetail(TABLE_OVERVIEW_ZOOM - 0.01)).toBe(
            'overview'
        );
        expect(getTableLevelOfDetail(TABLE_SILHOUETTE_ZOOM)).toBe('overview');
        expect(getTableLevelOfDetail(TABLE_SILHOUETTE_ZOOM - 0.01)).toBe(
            'silhouette'
        );
    });

    it('keeps overview labels readable without unbounded scaling', () => {
        expect(getTableOverviewLabelScale(0.48)).toBe(1);
        expect(getTableOverviewLabelScale(0.24)).toBe(2);
        expect(getTableOverviewLabelScale(0.1)).toBe(4);
        expect(getTableOverviewLabelScale(0)).toBe(4);
    });
});
