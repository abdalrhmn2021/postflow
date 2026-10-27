// The worker writes this key every HEARTBEAT_EVERY_MS and it expires after HEARTBEAT_TTL_SECONDS,
// so the API's /health can tell whether a worker is alive (the key exists) without talking to it.
export const HEARTBEAT_KEY = "postflow:worker:heartbeat";
export const HEARTBEAT_EVERY_MS = 30_000;
export const HEARTBEAT_TTL_SECONDS = 90;
