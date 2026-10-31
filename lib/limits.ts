/** Public safety limits. The access code and budget stay on the server. */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Base64 makes a 5 MB image a bit larger than 5 million characters. */
export const MAX_IMAGE_DATA_URL_CHARS = 7_500_000;

/** 20 images at the data-URL ceiling, plus room for text. */
export const MAX_ANALYZE_BODY_BYTES = 20 * MAX_IMAGE_DATA_URL_CHARS + 1_000_000;

export const MAX_BRIEFS_PER_RUN = 5;
export const MAX_MOCKUPS_PER_RUN = 5;

export const DEFAULT_LIVE_RUNS_PER_HOUR = 10;
