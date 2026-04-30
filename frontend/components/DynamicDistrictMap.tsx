'use client';

// The WV map is rendered from the bundled congressional_districts.geojson
// with no browser-only deps, so we re-export the component directly.
export { default } from './USDistrictChoroplethMap';
// Keep `NJDistrictData` as an alias so legacy imports still resolve.
export type { WVDistrictData, WVDistrictData as NJDistrictData } from './USDistrictChoroplethMap';
