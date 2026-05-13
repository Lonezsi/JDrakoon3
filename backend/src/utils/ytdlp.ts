import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import fetch from "node-fetch";
import logger from "./logger";

const execAsync = promisify(exec);

export interface VideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  try {
    const { stdout } = await execAsync(`yt-dlp -j "${url}"`);
    const data = JSON.parse(stdout);
    return {
      id: data.id,
      title: data.title,
      duration: data.duration || 0,
      thumbnail: data.thumbnail,
    };
  } catch (err) {
    logger.warn("yt-dlp failed, falling back to ytdl-core");
    const ytdl = require("ytdl-core");
    const info = await ytdl.getInfo(url);
    return {
      id: info.videoDetails.videoId,
      title: info.videoDetails.title,
      duration: parseInt(info.videoDetails.lengthSeconds) || 0,
      thumbnail: info.videoDetails.thumbnails[0]?.url || "",
    };
  }
}

export async function downloadThumbnail(
  url: string,
  outputPath: string,
): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.buffer();
  await fs.writeFile(outputPath, buffer);
}

export async function streamVideo(url: string, res: any): Promise<void> {
  const { spawn } = require("child_process");
  const ytdlp = spawn("yt-dlp", ["-f", "best[ext=mp4]", "-o", "-", url]);
  ytdlp.stdout.pipe(res);
  ytdlp.on("error", (err: any) => {
    logger.error("Stream error:", err);
    res.status(500).end();
  });
}
