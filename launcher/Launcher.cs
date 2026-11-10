using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace MuzikalLauncher
{
    static class Program
    {
        private const int Port = 3456;
        private static readonly string ServerUrl = "http://localhost:" + Port;

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            // 1. Check if server is already running
            if (!IsServerRunning())
            {
                // 2. Start server
                string nodeExe = FindNodeExecutable(appDir);
                if (string.IsNullOrEmpty(nodeExe))
                {
                    MessageBox.Show(
                        "Müzikal motoru (node.exe) bulunamadı.\n\nLütfen kurulum dosyasını (Muzikal-Setup.exe) tekrar çalıştırın.",
                        "Müzikal Başlatma Hatası",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                string serverJs = Path.Combine(appDir, "server.js");
                if (!File.Exists(serverJs))
                {
                    MessageBox.Show(
                        "server.js dosyası bulunamadı:\n" + serverJs,
                        "Müzikal Hatası",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = nodeExe,
                        Arguments = "\"" + serverJs + "\"",
                        WorkingDirectory = appDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                    Process.Start(psi);
                }
                catch (Exception ex)
                {
                    MessageBox.Show(
                        "Sunucu başlatılamadı:\n" + ex.Message,
                        "Müzikal Hatası",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                // 3. Wait for server to become responsive (up to 12 seconds)
                bool ready = false;
                for (int i = 0; i < 40; i++)
                {
                    Thread.Sleep(300);
                    if (IsServerRunning())
                    {
                        ready = true;
                        break;
                    }
                }

                if (!ready)
                {
                    MessageBox.Show(
                        "Müzikal sunucusu zamanında yanıt vermedi (Port 3456).\nLütfen güvenlik duvarınızı veya antivirüs ayarlarınızı kontrol edin.",
                        "Müzikal Bağlantı Hatası",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                    return;
                }
            }

            // 4. Launch Application Window (Dedicated Chrome/Edge App Mode with isolated profile)
            LaunchAppWindow(appDir);
        }

        private static bool IsServerRunning()
        {
            string[] checkUrls = new string[]
            {
                "http://127.0.0.1:" + Port + "/api/version",
                "http://localhost:" + Port + "/api/version"
            };

            foreach (string url in checkUrls)
            {
                try
                {
                    HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
                    req.Timeout = 1000;
                    req.Method = "GET";
                    using (HttpWebResponse res = (HttpWebResponse)req.GetResponse())
                    {
                        if (res.StatusCode == HttpStatusCode.OK) return true;
                    }
                }
                catch { }
            }
            return false;
        }

        private static string FindNodeExecutable(string appDir)
        {
            // 1. Embedded bin\node.exe (Primary)
            string localNode = Path.Combine(appDir, "bin", "node.exe");
            if (File.Exists(localNode)) return localNode;

            // 2. Standard Program Files
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pfNode = Path.Combine(pf, "nodejs", "node.exe");
            if (File.Exists(pfNode)) return pfNode;

            // 3. Program Files (x86)
            string pfx86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pfx86Node = Path.Combine(pfx86, "nodejs", "node.exe");
            if (File.Exists(pfx86Node)) return pfx86Node;

            // 4. LocalAppData
            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string localAppNode = Path.Combine(localApp, "Programs", "nodejs", "node.exe");
            if (File.Exists(localAppNode)) return localAppNode;

            // 5. System PATH check
            try
            {
                Process p = new Process();
                p.StartInfo.FileName = "where.exe";
                p.StartInfo.Arguments = "node";
                p.StartInfo.UseShellExecute = false;
                p.StartInfo.RedirectStandardOutput = true;
                p.StartInfo.CreateNoWindow = true;
                p.Start();
                string output = p.StandardOutput.ReadToEnd();
                p.WaitForExit(1000);
                if (!string.IsNullOrWhiteSpace(output))
                {
                    string first = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)[0].Trim();
                    if (File.Exists(first)) return first;
                }
            }
            catch { }

            return null;
        }

        private static void LaunchAppWindow(string appDir)
        {
            string profileDir = Path.Combine(appDir, "data", "profile");
            try
            {
                if (!Directory.Exists(profileDir)) Directory.CreateDirectory(profileDir);
                // Remove stale Chromium lockfiles so app mode never hangs or breaks out into browser tabs
                string lockFile = Path.Combine(profileDir, "lockfile");
                if (File.Exists(lockFile)) File.Delete(lockFile);
            }
            catch { }

            string browserPath = FindBestBrowser();

            if (!string.IsNullOrEmpty(browserPath))
            {
                try
                {
                    // App mode: frameless window without URL/tab bars, feels like a 100% native desktop app!
                    // CRITICAL: --app={0} without quotes around URL so Chromium parser treats it strictly as an application window!
                    string args = string.Format(
                        "--app={0} --user-data-dir=\"{1}\" --no-first-run --no-default-browser-check --disable-features=Translate,EdgeSidebar,EdgeWallet,EdgeShopping --window-size=1380,860",
                        ServerUrl,
                        profileDir
                    );

                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = args,
                        WorkingDirectory = appDir
                    };
                    Process.Start(psi);
                    return;
                }
                catch { }
            }

            // Fallback: Default browser
            try
            {
                Process.Start(ServerUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Uygulama açılamadı:\n" + ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static string FindBestBrowser()
        {
            // 1. Microsoft Edge (Always present on Windows 10/11, highly reliable PWA/App Mode)
            string[] edgePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe")
            };
            foreach (string p in edgePaths)
            {
                if (File.Exists(p)) return p;
            }

            // 2. Google Chrome (64-bit & 32-bit & User-level)
            string[] chromePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Google", "Chrome", "Application", "chrome.exe")
            };
            foreach (string p in chromePaths)
            {
                if (File.Exists(p)) return p;
            }

            // 3. Brave Browser
            string[] bravePaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BraveSoftware", "Brave-Browser", "Application", "brave.exe")
            };
            foreach (string p in bravePaths)
            {
                if (File.Exists(p)) return p;
            }

            // 4. Vivaldi Browser
            string[] vivaldiPaths = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Vivaldi", "Application", "vivaldi.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Vivaldi", "Application", "vivaldi.exe")
            };
            foreach (string p in vivaldiPaths)
            {
                if (File.Exists(p)) return p;
            }

            return null;
        }
    }
}
