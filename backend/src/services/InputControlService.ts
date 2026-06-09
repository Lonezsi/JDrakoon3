import { spawn, ChildProcess } from "child_process";
import logger from "../utils/logger";

// ---------------------------------------------------------------
// Drives the real OS mouse/keyboard so the phone's touchpad can
// control the PC. Implemented with a single long-lived PowerShell
// process that we feed one command per line over stdin:
//
//   M <dx> <dy>   relative mouse move
//   C             left click
//   R             right click
//   S <amount>    scroll wheel (signed)
//   K <name>      special key: ESC | ENTER | WIN | ALTTAB
//   T <base64>    type UTF-8 text (base64 to avoid escaping issues)
//
// PowerShell loads a tiny Win32 P/Invoke helper once at startup, so
// each command is just a static call — no per-event process spawn.
// No native npm modules; Windows only.
// ---------------------------------------------------------------

const PS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class NativeInput {
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, IntPtr extra);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, IntPtr extra);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  const uint LEFTDOWN = 0x0002, LEFTUP = 0x0004, RIGHTDOWN = 0x0008, RIGHTUP = 0x0010, WHEEL = 0x0800;
  const uint KEYUP = 0x0002;
  public static void Move(int dx, int dy) { POINT p; GetCursorPos(out p); SetCursorPos(p.X + dx, p.Y + dy); }
  public static void Click(bool right) {
    if (right) { mouse_event(RIGHTDOWN,0,0,0,IntPtr.Zero); mouse_event(RIGHTUP,0,0,0,IntPtr.Zero); }
    else { mouse_event(LEFTDOWN,0,0,0,IntPtr.Zero); mouse_event(LEFTUP,0,0,0,IntPtr.Zero); }
  }
  public static void Scroll(int amount) { mouse_event(WHEEL,0,0,(uint)amount,IntPtr.Zero); }
  public static void Tap(byte vk) { keybd_event(vk,0,0,IntPtr.Zero); keybd_event(vk,0,KEYUP,IntPtr.Zero); }
  public static void Down(byte vk) { keybd_event(vk,0,0,IntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk,0,KEYUP,IntPtr.Zero); }
}
"@

function Send-Text($t) {
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $t.ToCharArray()) {
    if ('+^%~(){}[]'.Contains($ch)) { [void]$sb.Append('{'); [void]$sb.Append($ch); [void]$sb.Append('}') }
    else { [void]$sb.Append($ch) }
  }
  [System.Windows.Forms.SendKeys]::SendWait($sb.ToString())
}

$enc = [System.Text.Encoding]::UTF8
while (($line = [Console]::In.ReadLine()) -ne $null) {
  if ($line.Length -eq 0) { continue }
  $cmd = $line.Substring(0, 1)
  $rest = if ($line.Length -gt 2) { $line.Substring(2) } else { "" }
  try {
    switch ($cmd) {
      'M' { $p = $rest.Split(' '); [NativeInput]::Move([int]$p[0], [int]$p[1]) }
      'C' { [NativeInput]::Click($false) }
      'R' { [NativeInput]::Click($true) }
      'S' { [NativeInput]::Scroll([int]$rest) }
      'K' {
        switch ($rest) {
          'ESC'       { [NativeInput]::Tap(0x1B) }
          'ENTER'     { [NativeInput]::Tap(0x0D) }
          'WIN'       { [NativeInput]::Tap(0x5B) }
          'BACKSPACE' { [NativeInput]::Tap(0x08) }
          'ALTTAB'    { [NativeInput]::Down(0x12); [NativeInput]::Tap(0x09); [NativeInput]::Up(0x12) }
        }
      }
      'T' { Send-Text ($enc.GetString([Convert]::FromBase64String($rest))) }
    }
  } catch {}
}
`;

class InputControlService {
  private proc: ChildProcess | null = null;
  private enabled = process.platform === "win32";

  // Mouse moves arrive at touch frequency; coalesce them so we write at
  // most one move per tick instead of flooding the PowerShell pipe.
  private pendingDx = 0;
  private pendingDy = 0;
  private flushTimer: NodeJS.Timeout | null = null;

  private ensureProc(): ChildProcess | null {
    if (!this.enabled) return null;
    if (this.proc && !this.proc.killed && this.proc.stdin?.writable) {
      return this.proc;
    }

    this.proc = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        PS_SCRIPT,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );

    this.proc.stderr?.on("data", (d) =>
      logger.warn("[inputControl]", d.toString().trim()),
    );
    this.proc.on("exit", (code) => {
      logger.warn(`[inputControl] PowerShell exited (${code})`);
      this.proc = null;
    });
    this.proc.on("error", (err) => {
      logger.error("[inputControl] failed to spawn PowerShell:", err.message);
      this.proc = null;
      this.enabled = false;
    });

    logger.info("[inputControl] PowerShell input driver started");
    return this.proc;
  }

  private write(line: string) {
    const p = this.ensureProc();
    if (!p?.stdin?.writable) return;
    try {
      p.stdin.write(line + "\n");
    } catch (err) {
      logger.warn("[inputControl] write failed:", (err as Error).message);
    }
  }

  move(dx: number, dy: number) {
    if (!this.enabled) return;
    this.pendingDx += dx;
    this.pendingDy += dy;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushMove(), 8);
    }
  }

  private flushMove() {
    this.flushTimer = null;
    const dx = Math.round(this.pendingDx);
    const dy = Math.round(this.pendingDy);
    this.pendingDx = 0;
    this.pendingDy = 0;
    if (dx !== 0 || dy !== 0) this.write(`M ${dx} ${dy}`);
  }

  click(right = false) {
    this.write(right ? "R" : "C");
  }

  scroll(amount: number) {
    if (amount !== 0) this.write(`S ${Math.round(amount)}`);
  }

  key(raw: string) {
    const k = (raw || "").toUpperCase().replace(/[^A-Z]/g, "");
    if (k === "ESC" || k === "ESCAPE") this.write("K ESC");
    else if (k === "ENTER" || k === "RETURN") this.write("K ENTER");
    else if (k === "WIN") this.write("K WIN");
    else if (k === "ALTTAB") this.write("K ALTTAB");
    else if (k === "BACKSPACE" || k === "BKSP") this.write("K BACKSPACE");
    // unknown key names are ignored
  }

  text(str: string) {
    if (!str) return;
    this.write(`T ${Buffer.from(str, "utf8").toString("base64")}`);
  }
}

export const inputControl = new InputControlService();
