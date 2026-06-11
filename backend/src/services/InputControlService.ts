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
  public static void LeftDown() { mouse_event(LEFTDOWN,0,0,0,IntPtr.Zero); }
  public static void LeftUp() { mouse_event(LEFTUP,0,0,0,IntPtr.Zero); }
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

# Virtual-key lookup for key-combo commands (Ctrl+C, Alt+F4, etc.)
$VK = @{
  'ctrl'=0x11; 'control'=0x11; 'shift'=0x10; 'alt'=0x12; 'win'=0x5B; 'meta'=0x5B;
  'enter'=0x0D; 'return'=0x0D; 'esc'=0x1B; 'escape'=0x1B; 'tab'=0x09; 'space'=0x20;
  'backspace'=0x08; 'bksp'=0x08; 'delete'=0x2E; 'del'=0x2E; 'home'=0x24; 'end'=0x23;
  'up'=0x26; 'down'=0x28; 'left'=0x25; 'right'=0x27; 'pageup'=0x21; 'pagedown'=0x22; 'insert'=0x2D;
}
function Get-Vk($name) {
  $n = "$name".ToLower()
  if ($VK.ContainsKey($n)) { return [byte]$VK[$n] }
  if ($n.Length -eq 1) {
    $c = [int][char]$n.ToUpper()
    if (($c -ge 65 -and $c -le 90) -or ($c -ge 48 -and $c -le 57)) { return [byte]$c }
  }
  if ($n -match '^f([1-9]|1[0-2])$') { return [byte](0x70 + [int]$Matches[1] - 1) }
  return [byte]0
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
      'D' { [NativeInput]::LeftDown() }
      'U' { [NativeInput]::LeftUp() }
      'S' { [NativeInput]::Scroll([int]$rest) }
      'K' {
        switch ($rest) {
          'ESC'       { [NativeInput]::Tap(0x1B) }
          'ENTER'     { [NativeInput]::Tap(0x0D) }
          'WIN'       { [NativeInput]::Tap(0x5B) }
          'BACKSPACE' { [NativeInput]::Tap(0x08) }
          'ALTTAB'    { [NativeInput]::Down(0x12); [NativeInput]::Tap(0x09); [NativeInput]::Up(0x12) }
          'UP'        { [NativeInput]::Tap(0x26) }
          'DOWN'      { [NativeInput]::Tap(0x28) }
          'LEFT'      { [NativeInput]::Tap(0x25) }
          'RIGHT'     { [NativeInput]::Tap(0x27) }
          'SPACE'     { [NativeInput]::Tap(0x20) }
          'TAB'       { [NativeInput]::Tap(0x09) }
          'DELETE'    { [NativeInput]::Tap(0x2E) }
          'HOME'      { [NativeInput]::Tap(0x24) }
          'END'       { [NativeInput]::Tap(0x23) }
          'PAGEUP'    { [NativeInput]::Tap(0x21) }
          'PAGEDOWN'  { [NativeInput]::Tap(0x22) }
          'INSERT'    { [NativeInput]::Tap(0x2D) }
          'F1'        { [NativeInput]::Tap(0x70) }
          'F2'        { [NativeInput]::Tap(0x71) }
          'F3'        { [NativeInput]::Tap(0x72) }
          'F4'        { [NativeInput]::Tap(0x73) }
          'F5'        { [NativeInput]::Tap(0x74) }
          'F6'        { [NativeInput]::Tap(0x75) }
          'F7'        { [NativeInput]::Tap(0x76) }
          'F8'        { [NativeInput]::Tap(0x77) }
          'F9'        { [NativeInput]::Tap(0x78) }
          'F10'       { [NativeInput]::Tap(0x79) }
          'F11'       { [NativeInput]::Tap(0x7A) }
          'F12'       { [NativeInput]::Tap(0x7B) }
        }
      }
      'X' {
        # Key combo: "<mods> <key>" e.g. "ctrl+shift c". Mods held while key taps.
        $parts = $rest.Split(' ')
        if ($parts.Length -ge 2) { $modNames = $parts[0].Split('+'); $keyVk = Get-Vk $parts[1] }
        else { $modNames = @(); $keyVk = Get-Vk $parts[0] }
        $modVks = @()
        foreach ($m in $modNames) { if ($m -ne '') { $v = Get-Vk $m; if ($v -ne 0) { $modVks += $v } } }
        foreach ($v in $modVks) { [NativeInput]::Down($v) }
        if ($keyVk -ne 0) { [NativeInput]::Tap($keyVk) }
        [array]::Reverse($modVks)
        foreach ($v in $modVks) { [NativeInput]::Up($v) }
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

  /** Pre-spawn the PowerShell driver so the FIRST real input isn't delayed by
   *  its ~few-hundred-ms startup (that was the "first touch feels laggy" bug). */
  warm() {
    this.ensureProc();
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

  click(button: "left" | "right") {
    this.write(button === "right" ? "R" : "C");
  }

  /** Hold / release the left button — used for touch click-and-drag. */
  mouseDown() {
    this.write("D");
  }

  mouseUp() {
    this.write("U");
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
    else if (k === "UP" || k === "ARROWUP") this.write("K UP");
    else if (k === "DOWN" || k === "ARROWDOWN") this.write("K DOWN");
    else if (k === "LEFT" || k === "ARROWLEFT") this.write("K LEFT");
    else if (k === "RIGHT" || k === "ARROWRIGHT") this.write("K RIGHT");
    else if (k === "SPACE") this.write("K SPACE");
    else if (k === "TAB") this.write("K TAB");
    else if (k === "ESC") this.write("K ESC");
    else if (k === "DELETE" || k === "DEL") this.write("K DELETE");
    else if (k === "HOME") this.write("K HOME");
    else if (k === "END") this.write("K END");
    else if (k === "PAGEUP") this.write("K PAGEUP");
    else if (k === "PAGEDOWN") this.write("K PAGEDOWN");
    else if (k === "INSERT") this.write("K INSERT");
    else if (k === "F1") this.write("K F1");
    else if (k === "F2") this.write("K F2");
    else if (k === "F3") this.write("K F3");
    else if (k === "F4") this.write("K F4");
    else if (k === "F5") this.write("K F5");
    else if (k === "F6") this.write("K F6");
    else if (k === "F7") this.write("K F7");
    else if (k === "F8") this.write("K F8");
    else if (k === "F9") this.write("K F9");
    else if (k === "F10") this.write("K F10");
    else if (k === "F11") this.write("K F11");
    else if (k === "F12") this.write("K F12");
    else if (k === "CLICK") this.click("left");
    else if (k === "RIGHTCLICK") this.click("right");
    // unknown key names are ignored
  }

  text(str: string) {
    if (!str) return;
    this.write(`T ${Buffer.from(str, "utf8").toString("base64")}`);
  }

  /** Send a key combo like "ctrl+c", "ctrl shift esc", "alt+f4".
   *  Modifiers are held while the final key taps. */
  combo(spec: string) {
    const s = (spec || "").trim().toLowerCase();
    if (!s) return;
    // Tokens may be separated by space and/or '+'. The LAST token is the key,
    // everything before it is a modifier.
    const tokens = s.split(/[\s+]+/).filter(Boolean);
    if (tokens.length === 0) return;
    const key = tokens[tokens.length - 1];
    const mods = tokens.slice(0, -1);
    const modStr = mods.length ? mods.join("+") : "";
    // Only allow simple [a-z0-9+] in the line we feed PowerShell.
    const safe = (modStr + " " + key).replace(/[^a-z0-9+ ]/g, "").trim();
    if (safe) this.write(`X ${safe}`);
  }
}

export const inputControl = new InputControlService();
