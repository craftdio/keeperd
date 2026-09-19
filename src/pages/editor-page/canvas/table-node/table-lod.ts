export const TABLE_OVERVIEW_ZOOM = 0.38;
export const TABLE_SILHOUETTE_ZOOM = 0.18;

export type TableLevelOfDetail = 'detail' | 'overview' | 'silhouette';

export const getTableLevelOfDetail = (zoom: number): TableLevelOfDetail => {
    if (zoom < TABLE_SILHOUETTE_ZOOM) return 'silhouette';
    if (zoom < TABLE_OVERVIEW_ZOOM) return 'overview';
    return 'detail';
};

export const getTableOverviewLabelScale = (zoom: number): number =>
    Math.min(4, Math.max(1, 0.48 / Math.max(zoom, 0.1)));
