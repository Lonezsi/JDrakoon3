import assert from "assert";
import {
  writeRunningFile,
  readRunningFile,
  removeRunningFile,
  isPidAlive,
  validateRunningFileStartup,
} from "../services/RunningFile";

export async function runRunningFileTests() {
  // Ensure clean start
  try {
    removeRunningFile();
  } catch {}

  // Write and read roundtrip
  writeRunningFile({
    pid: process.pid,
    app: "test-app",
    startedAt: Date.now(),
  });
  const data = readRunningFile();
  assert(data !== null, "running file should exist after write");
  assert.strictEqual(
    data!.pid,
    process.pid,
    "pid should match current process",
  );
  assert.strictEqual(data!.app, "test-app");

  // isPidAlive should be true for current process
  assert.strictEqual(
    isPidAlive(process.pid),
    true,
    "current pid should be alive",
  );

  // remove and confirm
  removeRunningFile();
  const none = readRunningFile();
  assert.strictEqual(none, null, "running file should be removed");

  // validate startup should remove stale entries
  writeRunningFile({ pid: 999999, app: "dead-app", startedAt: Date.now() });
  const v = validateRunningFileStartup();
  assert.strictEqual(v.existed, true);
  assert.strictEqual(v.removed, true);
  const after = readRunningFile();
  assert.strictEqual(
    after,
    null,
    "stale running file should be removed by validate",
  );
}
