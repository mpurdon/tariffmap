/**
 * Every string that comes from data (the curated dataset is written by an agent reading the
 * open web, then reviewed) is escaped before it enters an HTML template, and links must be
 * https. With the CSP in public/_headers this is defence in depth, not the only line.
 */
const ENTITIES: Record<string, string> = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

export const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c => ENTITIES[c]);

/** An https URL, escaped for an attribute; anything else (javascript:, data:, relative) becomes "#". */
export const safeUrl = (url: unknown): string => (typeof url === 'string' && /^https:\/\/[^\s]+$/i.test(url) ? esc(url) : '#');
