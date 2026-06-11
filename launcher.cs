// ──────────────────────────────────────────────────────────────────────────
//  JDrakoon3 launcher (C# / winexe) — RUNTIME ONLY.
//
//  Compiled with csc /target:winexe so it is a true GUI-subsystem app: it
//  NEVER shows a console window. Icon is embedded at compile time
//  (/win32icon) — no rcedit, no PE patching, nothing to corrupt.
//
//  At runtime it:
//    0. self-updates from the latest GitHub release if a newer version exists,
//    1. frees port 3001,
//    2. starts the prebuilt backend with the bundled node.exe (hidden),
//    3. waits for it to answer, then opens Edge in kiosk mode,
//    4. shuts down when EITHER the kiosk closes OR the backend exits.
//
//  No git, no npm, no compiling at startup. Users need only .NET Framework 4
//  (built into Windows 10/11).
// ──────────────────────────────────────────────────────────────────────────
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("JDrakoon3")]
[assembly: System.Reflection.AssemblyProduct("JDrakoon3")]
[assembly: System.Reflection.AssemblyCompany("Lonezsi")]
[assembly: System.Reflection.AssemblyFileVersion("3.0.1")]

static class Launcher
{
    const int PORT = 3001;
    // Always use the literal IPv4 loopback: "localhost" can resolve to ::1
    // first and, depending on how Node bound the socket, Edge may then show
    // ERR_CONNECTION_REFUSED. 127.0.0.1 is unambiguous.
    const string BASEURL = "http://127.0.0.1:3001";
    const string REPO = "Lonezsi/JDrakoon3";
    const string LATEST_API = "https://api.github.com/repos/Lonezsi/JDrakoon3/releases/latest";

    static string ROOT, BACKEND_DIR, DATA_DIR, LOG, BACKEND_LOG, EDGE_PROFILE;
    static Process backend, kiosk;
    static Mutex single;
    static readonly object ioLock = new object();

    static void Log(string msg)
    {
        try
        {
            lock (ioLock)
                File.AppendAllText(LOG, "[" + DateTime.Now.ToString("s") + "] " + msg + "\r\n");
        }
        catch { }
    }

    static int Main()
    {
        // GitHub (and its CDN) require TLS 1.2; .NET Framework 4 may default lower.
        try { ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12; } catch { }

        ROOT = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        BACKEND_DIR = Path.Combine(ROOT, "backend");
        string local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if (string.IsNullOrEmpty(local)) local = Path.GetTempPath();
        DATA_DIR = Path.Combine(local, "JDrakoon3");
        try { Directory.CreateDirectory(DATA_DIR); } catch { }
        LOG = Path.Combine(DATA_DIR, "launcher.log");
        BACKEND_LOG = Path.Combine(DATA_DIR, "backend.log");
        EDGE_PROFILE = Path.Combine(DATA_DIR, "edge-profile");

        // Single instance: a second launch (e.g. an accidental double double-click)
        // would fight over port 3001. Matches AppMutex in installer.iss.
        bool createdNew;
        single = new Mutex(true, "JDrakoon3_Launcher", out createdNew);
        if (!createdNew) { Log("Another instance is already running - exiting."); return 0; }

        try
        {
            Log("Launching from " + ROOT);
            if (!File.Exists(Path.Combine(BACKEND_DIR, "dist", "index.js")))
            {
                Log("FATAL: backend/dist/index.js missing - incomplete build.");
                return 1;
            }

            // Self-update first. If an update is staged the installer takes over
            // and relaunches the new version, so we just exit.
            if (TryAutoUpdate())
            {
                Log("Update started; handing off to installer.");
                return 0;
            }

            WipeKioskProfile();   // guarantee a fresh kiosk, never a cached error page
            KillPort();
            StartBackend();

            if (!WaitForBackend())
            {
                Log("Backend never answered.");
                Cleanup();
                return 1;
            }

            LaunchKiosk();

            // Block until the kiosk window closes OR the backend exits.
            while (true)
            {
                Thread.Sleep(400);
                if (HasExited(kiosk)) { Log("Kiosk closed."); break; }
                if (HasExited(backend)) { Log("Backend exited."); break; }
            }

            Cleanup();
            return 0;
        }
        catch (Exception ex)
        {
            Log("FATAL: " + ex.Message);
            Cleanup();
            return 1;
        }
        finally
        {
            try { single.ReleaseMutex(); } catch { }
        }
    }

    // ── Auto-update ─────────────────────────────────────────────────────────
    // Returns true if an update was downloaded and the installer was launched
    // (caller should then exit). All failures are swallowed so a flaky network
    // never blocks the app from starting.
    static bool TryAutoUpdate()
    {
        try
        {
            string current = ReadVersion();
            string json = HttpGetString(LATEST_API, 3500);
            if (json == null) { Log("Update check skipped (no response)."); return false; }

            var tag = Regex.Match(json, "\"tag_name\"\\s*:\\s*\"([^\"]+)\"");
            if (!tag.Success) return false;
            string remote = tag.Groups[1].Value.TrimStart('v', 'V').Trim();

            if (!IsNewer(remote, current))
            {
                Log("Up to date (" + current + ", latest " + remote + ").");
                return false;
            }

            // Find the installer asset (…Setup.exe).
            string asset = null;
            foreach (Match m in Regex.Matches(json, "\"browser_download_url\"\\s*:\\s*\"([^\"]+)\""))
            {
                string url = m.Groups[1].Value;
                string low = url.ToLowerInvariant();
                if (low.EndsWith(".exe") && low.Contains("setup")) { asset = url; break; }
            }
            if (asset == null)
            {
                Log("Newer release " + remote + " found but it has no Setup.exe asset - skipping.");
                return false;
            }

            Log("Updating " + current + " -> " + remote + " from " + asset);
            string dir = Path.Combine(DATA_DIR, "update");
            try { Directory.CreateDirectory(dir); } catch { }
            string dst = Path.Combine(dir, "JDrakoon3-Setup.exe");
            if (!Download(asset, dst)) { Log("Update download failed - continuing with current version."); return false; }

            // Run the installer AFTER we exit (2s lets any file lock clear). The
            // installer is silent and relaunches the new version itself.
            string args = "/c timeout /t 2 /nobreak >nul & \"" + dst + "\" /VERYSILENT /NORESTART";
            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
            });
            return true;
        }
        catch (Exception e)
        {
            Log("Auto-update skipped: " + e.Message);
            return false;
        }
    }

    static string ReadVersion()
    {
        try
        {
            string vf = Path.Combine(ROOT, "VERSION");
            if (File.Exists(vf)) return File.ReadAllText(vf).Trim();
        }
        catch { }
        return "0.0.0";
    }

    static bool IsNewer(string remote, string current)
    {
        int[] a = ParseVer(remote), b = ParseVer(current);
        int n = Math.Max(a.Length, b.Length);
        for (int i = 0; i < n; i++)
        {
            int x = i < a.Length ? a[i] : 0;
            int y = i < b.Length ? b[i] : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    static int[] ParseVer(string v)
    {
        if (string.IsNullOrEmpty(v)) return new int[0];
        var parts = v.Split('.');
        var nums = new int[parts.Length];
        for (int i = 0; i < parts.Length; i++)
        {
            var digits = Regex.Match(parts[i], "\\d+");
            nums[i] = digits.Success ? int.Parse(digits.Value) : 0;
        }
        return nums;
    }

    static string HttpGetString(string url, int timeoutMs)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "JDrakoon3-Updater";
            req.Accept = "application/vnd.github+json";
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var sr = new StreamReader(resp.GetResponseStream()))
                return sr.ReadToEnd();
        }
        catch { return null; }
    }

    static bool Download(string url, string dst)
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.UserAgent = "JDrakoon3-Updater";
            req.Timeout = 60000;
            req.ReadWriteTimeout = 300000;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var rs = resp.GetResponseStream())
            using (var fs = File.Create(dst))
                rs.CopyTo(fs);
            return new FileInfo(dst).Length > 0;
        }
        catch (Exception e) { Log("download error: " + e.Message); return false; }
    }

    // ── App lifecycle ─────────────────────────────────────────────────────────
    static bool HasExited(Process p)
    {
        try { return p != null && p.HasExited; } catch { return false; }
    }

    static string NodeBin()
    {
        string bundled = Path.Combine(ROOT, "node.exe");
        return File.Exists(bundled) ? bundled : "node";
    }

    static void StartBackend()
    {
        string node = NodeBin();
        Log("Starting backend with " + node);
        try { File.WriteAllText(BACKEND_LOG, ""); } catch { }

        var psi = new ProcessStartInfo
        {
            FileName = node,
            Arguments = "dist/index.js",
            WorkingDirectory = BACKEND_DIR,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.EnvironmentVariables["NODE_ENV"] = "production";

        backend = new Process { StartInfo = psi, EnableRaisingEvents = true };
        DataReceivedEventHandler sink = (s, e) =>
        {
            if (e.Data == null) return;
            try { lock (ioLock) File.AppendAllText(BACKEND_LOG, e.Data + "\r\n"); } catch { }
        };
        backend.OutputDataReceived += sink;
        backend.ErrorDataReceived += sink;
        backend.Start();
        backend.BeginOutputReadLine();
        backend.BeginErrorReadLine();
    }

    static bool WaitForBackend()
    {
        for (int i = 0; i < 60; i++)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(BASEURL + "/api/version");
                req.Timeout = 1500;
                using (var resp = (HttpWebResponse)req.GetResponse())
                    if ((int)resp.StatusCode < 500) return true;
            }
            catch { }

            if (HasExited(backend)) return false; // crashed on startup
            Thread.Sleep(500);
        }
        return false;
    }

    static string FindEdge()
    {
        string[] roots =
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
        };
        foreach (var r in roots)
        {
            if (string.IsNullOrEmpty(r)) continue;
            string p = Path.Combine(r, "Microsoft\\Edge\\Application\\msedge.exe");
            if (File.Exists(p)) return p;
        }
        return null;
    }

    static void WipeKioskProfile()
    {
        // A persisted kiosk profile can restore a previous (possibly errored)
        // session, which is exactly the "ERR_CONNECTION_REFUSED that won't go
        // away" symptom. Start clean every time. Best-effort: if Edge still
        // holds a lock the delete fails and we just carry on.
        try { if (Directory.Exists(EDGE_PROFILE)) Directory.Delete(EDGE_PROFILE, true); }
        catch (Exception e) { Log("profile wipe skipped: " + e.Message); }
    }

    static void LaunchKiosk()
    {
        string edge = FindEdge();
        if (edge == null)
        {
            Log("Edge not found - opening default browser (no kiosk).");
            try { Process.Start(new ProcessStartInfo { FileName = BASEURL, UseShellExecute = true }); }
            catch (Exception e) { Log("default browser failed: " + e.Message); }
            return;
        }

        string args =
            "--kiosk " + BASEURL +
            " --edge-kiosk-type=fullscreen" +
            " --no-first-run --no-default-browser-check" +
            " --disable-session-crashed-bubble --noerrdialogs" +
            " --user-data-dir=\"" + EDGE_PROFILE + "\"";

        Log("Opening kiosk.");
        kiosk = Process.Start(new ProcessStartInfo
        {
            FileName = edge,
            Arguments = args,
            UseShellExecute = false,
        });
    }

    static void Run(string file, string args)
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo
            {
                FileName = file,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
            });
            p.StandardOutput.ReadToEnd();
            p.WaitForExit();
        }
        catch { }
    }

    static void KillPort()
    {
        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "netstat.exe",
                Arguments = "-ano",
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
            };
            var p = Process.Start(psi);
            string outp = p.StandardOutput.ReadToEnd();
            p.WaitForExit();

            foreach (var line in outp.Split('\n'))
            {
                if (line.IndexOf("LISTENING", StringComparison.OrdinalIgnoreCase) < 0) continue;
                var parts = line.Trim().Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);

                bool onPort = false;
                foreach (var tok in parts)
                    if (tok.EndsWith(":" + PORT, StringComparison.Ordinal)) { onPort = true; break; }
                if (!onPort) continue;

                int pid;
                if (parts.Length >= 1 && int.TryParse(parts[parts.Length - 1], out pid) && pid > 0)
                {
                    Run("taskkill.exe", "/PID " + pid + " /F");
                    Log("Freed port " + PORT + " (killed pid " + pid + ")");
                }
            }
        }
        catch { }
    }

    static void Cleanup()
    {
        Log("Shutting down.");
        try { if (kiosk != null && !kiosk.HasExited) Run("taskkill.exe", "/PID " + kiosk.Id + " /F /T"); } catch { }
        try { if (backend != null && !backend.HasExited) backend.Kill(); } catch { }
        KillPort();
        Log("Done.");
    }
}
