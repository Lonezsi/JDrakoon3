// ──────────────────────────────────────────────────────────────────────────
//  JDrakoon3 launcher (C# / winexe) — RUNTIME ONLY.
//
//  Compiled with csc /target:winexe so it is a true GUI-subsystem app: it
//  NEVER shows a console window. Icon is embedded at compile time
//  (/win32icon) — no rcedit, no PE patching, nothing to corrupt.
//
//  Everything is prebuilt by build-release.ps1. At runtime we only:
//    1. free port 3001,
//    2. start the prebuilt backend with the bundled node.exe (hidden),
//    3. wait for it to answer, then open Edge in kiosk mode,
//    4. shut down when EITHER the kiosk closes OR the backend exits
//       (e.g. the in-app Shutdown button).
//
//  No git, no npm, no compiling at startup. Users need only .NET Framework 4
//  (built into Windows 10/11).
// ──────────────────────────────────────────────────────────────────────────
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("JDrakoon3")]
[assembly: System.Reflection.AssemblyProduct("JDrakoon3")]
[assembly: System.Reflection.AssemblyCompany("Lonezsi")]
[assembly: System.Reflection.AssemblyFileVersion("3.0.1")]

static class Launcher
{
    const int PORT = 3001;
    const string URL = "http://localhost:3001";

    static string ROOT, BACKEND_DIR, DATA_DIR, LOG, BACKEND_LOG, EDGE_PROFILE;
    static Process backend, kiosk;
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
        ROOT = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        BACKEND_DIR = Path.Combine(ROOT, "backend");
        string local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if (string.IsNullOrEmpty(local)) local = Path.GetTempPath();
        DATA_DIR = Path.Combine(local, "JDrakoon3");
        try { Directory.CreateDirectory(DATA_DIR); } catch { }
        LOG = Path.Combine(DATA_DIR, "launcher.log");
        BACKEND_LOG = Path.Combine(DATA_DIR, "backend.log");
        EDGE_PROFILE = Path.Combine(DATA_DIR, "edge-profile");

        try
        {
            Log("Launching from " + ROOT);
            if (!File.Exists(Path.Combine(BACKEND_DIR, "dist", "index.js")))
            {
                Log("FATAL: backend/dist/index.js missing - incomplete build.");
                return 1;
            }

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
    }

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
                var req = (HttpWebRequest)WebRequest.Create(URL + "/api/version");
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

    static void LaunchKiosk()
    {
        string edge = FindEdge();
        if (edge == null)
        {
            Log("Edge not found - opening default browser (no kiosk).");
            try { Process.Start(new ProcessStartInfo { FileName = URL, UseShellExecute = true }); }
            catch (Exception e) { Log("default browser failed: " + e.Message); }
            return;
        }

        // A dedicated user-data-dir forces a fresh, isolated Edge instance whose
        // process we can reliably watch (otherwise --kiosk may attach to an
        // already-running Edge and our handle exits instantly).
        string args =
            "--kiosk " + URL +
            " --edge-kiosk-type=fullscreen --no-first-run --no-default-browser-check" +
            " --user-data-dir=\"" + EDGE_PROFILE + "\"";

        Log("Opening kiosk.");
        kiosk = Process.Start(new ProcessStartInfo
        {
            FileName = edge,
            Arguments = args,
            UseShellExecute = false,
        });
    }

    static void Run(string file, string args, bool wait)
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
            if (wait) { p.StandardOutput.ReadToEnd(); p.WaitForExit(); }
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
                    Run("taskkill.exe", "/PID " + pid + " /F", true);
                    Log("Freed port " + PORT + " (killed pid " + pid + ")");
                }
            }
        }
        catch { }
    }

    static void Cleanup()
    {
        Log("Shutting down.");
        try { if (kiosk != null && !kiosk.HasExited) Run("taskkill.exe", "/PID " + kiosk.Id + " /F /T", true); } catch { }
        try { if (backend != null && !backend.HasExited) backend.Kill(); } catch { }
        KillPort();
        Log("Done.");
    }
}
