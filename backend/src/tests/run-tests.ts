import { runRunningFileTests } from "./RunningFile.test";

async function runAll() {
  console.log("Running backend tests...");
  try {
    await runRunningFileTests();
    console.log("All tests passed");
    process.exit(0);
  } catch (err) {
    console.error("Tests failed:", err);
    process.exit(1);
  }
}

runAll();
