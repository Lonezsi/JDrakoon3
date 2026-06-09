import React from "react";
import { AppDefinition, MediaItem } from "./types";
import { Gamepad2, Video, Tv, Gamepad } from "lucide-react";

export const BOUNDS = { x: 12, z: 8 };
export const CUBE_SIZE = 1.2;
export const COLLISION_RADIUS = 0.75;

export const APP_STATES = {
  BOOT: "BOOT",
  HOME: "HOME",
  SETTINGS: "SETTINGS",
  APP_RUNNING: "APP_RUNNING",
} as const;

export const APPS: AppDefinition[] = [
  {
    id: "vscode",
    name: "VSCode",
    launcher:
      '"C:\\Users\\karac\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"',
    icon: React.createElement(Gamepad2),
    color: "bg-green-600",
    hex: "#16a34a",
  },
  {
    id: "steam",
    name: "Steam",
    launcher: "steam://",
    icon: React.createElement(Gamepad2),
    color: "bg-blue-600",
    hex: "#2563eb",
  },
  {
    id: "youtube",
    name: "YouTube TV",
    launcher: "youtube://",
    icon: React.createElement(Video),
    color: "bg-red-600",
    hex: "#dc2626",
  },
  {
    id: "plex",
    name: "Plex",
    icon: React.createElement(Tv),
    color: "bg-yellow-500",
    hex: "#eab308",
  },
  {
    id: "retroarch",
    name: "RetroArch",
    icon: React.createElement(Gamepad),
    color: "bg-slate-600",
    hex: "#475569",
  },
];
