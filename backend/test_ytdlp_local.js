const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const BIN_DIR = path.join(__dirname, "bin");
const YTDLP_PATH = path.join(BIN_DIR, "yt-dlp.exe");

// Ensure binary exists (if not, we can't test)
if (!fs.existsSync(YTDLP_PATH)) {
  console.log(
    "yt-dlp.exe not found in bin/. The auto‑download should have run.",
  );
  console.log(
    "Run the backend once and try adding a video to trigger the download.",
  );
  process.exit(1);
}

const testUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw"; // "Me at the zoo"

console.log("Testing yt-dlp:", YTDLP_PATH);
exec(
  `"${YTDLP_PATH}" -j "${testUrl}"`,
  { timeout: 15000 },
  (err, stdout, stderr) => {
    if (err) {
      console.error("FAILED:", err.message);
      if (stderr) console.error("stderr:", stderr);
      process.exit(1);
    }
    try {
      const info = JSON.parse(stdout);
      console.log("SUCCESS! Title:", info.title);
    } catch (e) {
      console.error("JSON parse error:", e.message);
    }
  },
);
