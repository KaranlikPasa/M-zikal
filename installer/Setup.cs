using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MuzikalInstaller
{
    static class Program
    {
        public const string AppVersion = "1.3.4";
        public const string AppName = "Müzikal";
        public const string RegKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Muzikal";

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isSilent = false;
            bool isUpdate = false;
            bool isUninstall = false;

            foreach (string arg in args)
            {
                string a = arg.ToUpperInvariant();
                if (a == "/SILENT" || a == "/VERYSILENT" || a == "-S" || a == "--SILENT") isSilent = true;
                if (a == "/UPDATE") isUpdate = true;
                if (a == "/UNINSTALL") isUninstall = true;
            }

            if (isUninstall)
            {
                RunUninstaller(isSilent);
                return;
            }

            if (isSilent || isUpdate)
            {
                RunSilentInstall();
                return;
            }

            Application.Run(new InstallerForm());
        }

        public static string GetDefaultInstallDir()
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(RegKeyPath))
                {
                    if (key != null)
                    {
                        object loc = key.GetValue("InstallLocation");
                        if (loc != null && !string.IsNullOrWhiteSpace(loc.ToString()))
                        {
                            return loc.ToString();
                        }
                    }
                }
            }
            catch { }

            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(localApp, "Programs", "Muzikal");
        }

        public static void KillRunningProcesses(string installDir)
        {
            try
            {
                // Kill any lingering process listening on port 3456
                Process netstat = new Process();
                netstat.StartInfo.FileName = "cmd.exe";
                netstat.StartInfo.Arguments = "/c netstat -ano | findstr :3456";
                netstat.StartInfo.UseShellExecute = false;
                netstat.StartInfo.RedirectStandardOutput = true;
                netstat.StartInfo.CreateNoWindow = true;
                netstat.Start();
                string output = netstat.StandardOutput.ReadToEnd();
                netstat.WaitForExit();

                string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                foreach (string line in lines)
                {
                    string[] parts = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 5)
                    {
                        int pid;
                        if (int.TryParse(parts[parts.Length - 1], out pid) && pid > 0)
                        {
                            try
                            {
                                Process p = Process.GetProcessById(pid);
                                p.Kill();
                                p.WaitForExit(1000);
                            }
                            catch { }
                        }
                    }
                }
            }
            catch { }

            try
            {
                Process[] procs = Process.GetProcessesByName("node");
                foreach (Process p in procs)
                {
                    try
                    {
                        p.Kill();
                        p.WaitForExit(1000);
                    }
                    catch { }
                }
            }
            catch { }
        }

        public static void PerformInstall(string targetDir, Action<int, string> progressCallback)
        {
            KillRunningProcesses(targetDir);

            if (!Directory.Exists(targetDir))
            {
                Directory.CreateDirectory(targetDir);
            }

            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream stream = asm.GetManifestResourceStream("MuzikalPayload.zip"))
            {
                if (stream == null)
                {
                    // Fallback: check if zip file exists next to exe
                    string localZip = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Muzikal-Windows-x64.zip");
                    if (File.Exists(localZip))
                    {
                        ExtractZipFile(localZip, targetDir, progressCallback);
                    }
                    else
                    {
                        throw new FileNotFoundException("Gömülü kurulum arşivi (MuzikalPayload.zip) bulunamadı!");
                    }
                }
                else
                {
                    using (ZipArchive archive = new ZipArchive(stream))
                    {
                        int total = archive.Entries.Count;
                        int cur = 0;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            cur++;
                            if (string.IsNullOrEmpty(entry.Name)) continue; // Directory entry

                            string destPath = Path.Combine(targetDir, entry.FullName);
                            string destFolder = Path.GetDirectoryName(destPath);
                            if (!Directory.Exists(destFolder))
                            {
                                Directory.CreateDirectory(destFolder);
                            }

                            // Preserve existing playlists and downloads on update!
                            if (entry.FullName.Equals("data/library.json", StringComparison.OrdinalIgnoreCase) && File.Exists(destPath))
                            {
                                continue;
                            }
                            if (entry.FullName.StartsWith("downloads/", StringComparison.OrdinalIgnoreCase) && File.Exists(destPath))
                            {
                                continue;
                            }

                            try
                            {
                                entry.ExtractToFile(destPath, true);
                            }
                            catch
                            {
                                // In case file is temporarily busy
                                Thread.Sleep(100);
                                entry.ExtractToFile(destPath, true);
                            }

                            int pct = (int)((cur / (float)total) * 90);
                            progressCallback(pct, entry.Name);
                        }
                    }
                }
            }

            // Copy setup executable as uninstaller
            try
            {
                string uninstallerPath = Path.Combine(targetDir, "Uninstall.exe");
                string currentExe = Assembly.GetExecutingAssembly().Location;
                if (!string.Equals(currentExe, uninstallerPath, StringComparison.OrdinalIgnoreCase))
                {
                    File.Copy(currentExe, uninstallerPath, true);
                }
            }
            catch { }

            progressCallback(95, "Kayıt defteri güncelleniyor...");
            RegisterInWindows(targetDir);

            progressCallback(100, "Kurulum tamamlandı!");
        }

        private static void ExtractZipFile(string zipPath, string targetDir, Action<int, string> progressCallback)
        {
            using (ZipArchive archive = ZipFile.OpenRead(zipPath))
            {
                int total = archive.Entries.Count;
                int cur = 0;
                foreach (ZipArchiveEntry entry in archive.Entries)
                {
                    cur++;
                    if (string.IsNullOrEmpty(entry.Name)) continue;
                    string destPath = Path.Combine(targetDir, entry.FullName);
                    string destFolder = Path.GetDirectoryName(destPath);
                    if (!Directory.Exists(destFolder)) Directory.CreateDirectory(destFolder);

                    if (entry.FullName.Equals("data/library.json", StringComparison.OrdinalIgnoreCase) && File.Exists(destPath))
                        continue;
                    if (entry.FullName.StartsWith("downloads/", StringComparison.OrdinalIgnoreCase) && File.Exists(destPath))
                        continue;

                    entry.ExtractToFile(destPath, true);
                    int pct = (int)((cur / (float)total) * 90);
                    progressCallback(pct, entry.Name);
                }
            }
        }

        public static void CreateShortcuts(string targetDir, bool desktop, bool startMenu)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType);

                string vbsPath = Path.Combine(targetDir, "Muzikal.vbs");
                string icoPath = Path.Combine(targetDir, "Muzikal.ico");

                if (desktop)
                {
                    string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                    string lnkPath = Path.Combine(desktopDir, "Müzikal.lnk");
                    dynamic shortcut = shell.CreateShortcut(lnkPath);
                    shortcut.TargetPath = vbsPath;
                    shortcut.WorkingDirectory = targetDir;
                    shortcut.Description = "Müzikal - Masaüstü ve Mobil Müzik Çalar";
                    if (File.Exists(icoPath)) shortcut.IconLocation = icoPath + ",0";
                    shortcut.Save();
                }

                if (startMenu)
                {
                    string programsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Müzikal");
                    if (!Directory.Exists(programsDir)) Directory.CreateDirectory(programsDir);

                    string lnkPath = Path.Combine(programsDir, "Müzikal.lnk");
                    dynamic shortcut = shell.CreateShortcut(lnkPath);
                    shortcut.TargetPath = vbsPath;
                    shortcut.WorkingDirectory = targetDir;
                    shortcut.Description = "Müzikal - Masaüstü ve Mobil Müzik Çalar";
                    if (File.Exists(icoPath)) shortcut.IconLocation = icoPath + ",0";
                    shortcut.Save();

                    // Also create uninstaller shortcut in Start Menu
                    string uninsPath = Path.Combine(targetDir, "Uninstall.exe");
                    if (File.Exists(uninsPath))
                    {
                        string uninsLnk = Path.Combine(programsDir, "Müzikal'i Kaldır.lnk");
                        dynamic uninsSc = shell.CreateShortcut(uninsLnk);
                        uninsSc.TargetPath = uninsPath;
                        uninsSc.Arguments = "/UNINSTALL";
                        uninsSc.WorkingDirectory = targetDir;
                        uninsSc.Description = "Müzikal uygulamasını bilgisayardan kaldırır";
                        uninsSc.Save();
                    }
                }
            }
            catch { }
        }

        public static void RegisterInWindows(string targetDir)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(RegKeyPath))
                {
                    if (key != null)
                    {
                        key.SetValue("DisplayName", AppName);
                        key.SetValue("DisplayVersion", AppVersion);
                        key.SetValue("Publisher", "Müzikal");
                        key.SetValue("DisplayIcon", Path.Combine(targetDir, "Muzikal.ico"));
                        key.SetValue("InstallLocation", targetDir);
                        key.SetValue("UninstallString", "\"" + Path.Combine(targetDir, "Uninstall.exe") + "\" /UNINSTALL");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                        key.SetValue("EstimatedSize", 95000, RegistryValueKind.DWord);
                    }
                }
            }
            catch { }
        }

        public static void LaunchApp(string targetDir)
        {
            try
            {
                string vbs = Path.Combine(targetDir, "Muzikal.vbs");
                if (File.Exists(vbs))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "wscript.exe",
                        Arguments = "\"" + vbs + "\"",
                        WorkingDirectory = targetDir,
                        WindowStyle = ProcessWindowStyle.Hidden
                    });
                }
            }
            catch { }
        }

        private static void RunSilentInstall()
        {
            try
            {
                string targetDir = GetDefaultInstallDir();
                PerformInstall(targetDir, (pct, status) => { });
                CreateShortcuts(targetDir, true, true);
                LaunchApp(targetDir);
            }
            catch
            {
                Environment.ExitCode = 1;
            }
        }

        private static void RunUninstaller(bool isSilent)
        {
            string installDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

            if (!isSilent)
            {
                DialogResult res = MessageBox.Show(
                    "Müzikal uygulamasını bilgisayarınızdan kaldırmak istediğinize emin misiniz?",
                    "Müzikal'i Kaldır",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                if (res != DialogResult.Yes) return;
            }

            bool keepData = true;
            if (!isSilent)
            {
                DialogResult keepRes = MessageBox.Show(
                    "İndirdiğiniz şarkılar ve favori listeleriniz saklansın mı?\n\n(Evet = Şarkılar ve listeler saklanır, Hayır = Tümü tamamen silinir)",
                    "Verileri Sakla",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );
                keepData = (keepRes == DialogResult.Yes);
            }

            KillRunningProcesses(installDir);

            // Remove Desktop and Start Menu Shortcuts
            try
            {
                string desktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Müzikal.lnk");
                if (File.Exists(desktopLnk)) File.Delete(desktopLnk);

                string startMenuFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Müzikal");
                if (Directory.Exists(startMenuFolder)) Directory.Delete(startMenuFolder, true);
            }
            catch { }

            // Remove Registry Key
            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(RegKeyPath, false);
            }
            catch { }

            // Delete files using a self-deleting batch script so Uninstall.exe can be deleted
            string tempBat = Path.Combine(Path.GetTempPath(), "muzikal_uninst.bat");
            string keepParam = keepData ? "keep" : "all";

            string scriptContent =
                "@echo off\r\n" +
                "ping 127.0.0.1 -n 2 >nul\r\n" +
                "cd /d \"" + installDir + "\"\r\n";

            if (keepData)
            {
                scriptContent +=
                    "del /q /f Muzikal.bat Muzikal.vbs Muzikal.ico server.js README.md 2>nul\r\n" +
                    "rmdir /s /q bin 2>nul\r\n" +
                    "rmdir /s /q public 2>nul\r\n" +
                    "del /q /f Uninstall.exe 2>nul\r\n";
            }
            else
            {
                scriptContent +=
                    "cd ..\r\n" +
                    "rmdir /s /q \"" + installDir + "\" 2>nul\r\n";
            }

            scriptContent +=
                "del /f /q \"%~f0\" 2>nul\r\n" +
                "exit\r\n";

            File.WriteAllText(tempBat, scriptContent);

            Process.Start(new ProcessStartInfo
            {
                FileName = "cmd.exe",
                Arguments = "/c \"" + tempBat + "\"",
                WindowStyle = ProcessWindowStyle.Hidden,
                CreateNoWindow = true
            });

            if (!isSilent)
            {
                MessageBox.Show("Müzikal başarıyla bilgisayarınızdan kaldırıldı.", "Müzikal", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }
    }

    public class InstallerForm : Form
    {
        private TextBox txtInstallDir;
        private CheckBox chkDesktop;
        private CheckBox chkStartMenu;
        private CheckBox chkLaunch;
        private ProgressBar progressBar;
        private Label lblStatus;
        private Button btnInstall;
        private Button btnCancel;
        private Button btnBrowse;

        public InstallerForm()
        {
            this.Text = "Müzikal Kurulum Sihirbazı v" + Program.AppVersion;
            this.Size = new Size(540, 420);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(10, 11, 16); // #0a0b10
            this.ForeColor = Color.FromArgb(241, 245, 249);
            this.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);

            try
            {
                string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Muzikal.ico");
                if (File.Exists(iconPath)) this.Icon = new Icon(iconPath);
            }
            catch { }

            BuildUI();
        }

        private void BuildUI()
        {
            // Header Panel
            Panel header = new Panel
            {
                Dock = DockStyle.Top,
                Height = 85,
                BackColor = Color.FromArgb(19, 22, 34) // #131622
            };

            Label title = new Label
            {
                Text = "🎵 Müzikal v" + Program.AppVersion,
                Font = new Font("Segoe UI", 16f, FontStyle.Bold),
                ForeColor = Color.FromArgb(30, 215, 96), // Spotify Green #1ed760
                Location = new Point(20, 15),
                AutoSize = true
            };

            Label subtitle = new Label
            {
                Text = "Modern masaüstü ve Android müzik çalar kurulumu.",
                Font = new Font("Segoe UI", 9.5f, FontStyle.Regular),
                ForeColor = Color.FromArgb(148, 163, 184),
                Location = new Point(23, 48),
                AutoSize = true
            };

            header.Controls.Add(title);
            header.Controls.Add(subtitle);
            this.Controls.Add(header);

            // Directory Label
            Label lblDir = new Label
            {
                Text = "Kurulum Klasörü:",
                Location = new Point(20, 105),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            this.Controls.Add(lblDir);

            // Directory TextBox
            txtInstallDir = new TextBox
            {
                Text = Program.GetDefaultInstallDir(),
                Location = new Point(20, 130),
                Width = 380,
                BackColor = Color.FromArgb(22, 27, 39),
                ForeColor = Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };
            this.Controls.Add(txtInstallDir);

            // Browse Button
            btnBrowse = new Button
            {
                Text = "Gözat...",
                Location = new Point(410, 128),
                Width = 90,
                Height = 27,
                BackColor = Color.FromArgb(30, 36, 50),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnBrowse.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnBrowse.Click += (s, e) =>
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.SelectedPath = txtInstallDir.Text;
                    fbd.Description = "Müzikal'in kurulacağı klasörü seçin:";
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtInstallDir.Text = fbd.SelectedPath;
                    }
                }
            };
            this.Controls.Add(btnBrowse);

            // Checkboxes
            chkDesktop = new CheckBox
            {
                Text = "Masaüstüne kısayol oluştur",
                Checked = true,
                Location = new Point(24, 175),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            this.Controls.Add(chkDesktop);

            chkStartMenu = new CheckBox
            {
                Text = "Başlat menüsüne kısayol ekle",
                Checked = true,
                Location = new Point(24, 205),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            this.Controls.Add(chkStartMenu);

            chkLaunch = new CheckBox
            {
                Text = "Kurulum tamamlanınca Müzikal'i başlat",
                Checked = true,
                Location = new Point(24, 235),
                AutoSize = true,
                ForeColor = Color.FromArgb(226, 232, 240)
            };
            this.Controls.Add(chkLaunch);

            // Progress Bar
            progressBar = new ProgressBar
            {
                Location = new Point(20, 275),
                Width = 480,
                Height = 18,
                Visible = false
            };
            this.Controls.Add(progressBar);

            // Status Label
            lblStatus = new Label
            {
                Text = "Kuruluma hazır. 'Kurulumu Başlat' butonuna tıklayın.",
                Location = new Point(20, 300),
                Width = 480,
                ForeColor = Color.FromArgb(148, 163, 184)
            };
            this.Controls.Add(lblStatus);

            // Bottom Buttons
            btnCancel = new Button
            {
                Text = "İptal",
                Location = new Point(400, 335),
                Width = 100,
                Height = 34,
                BackColor = Color.FromArgb(30, 36, 50),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            btnCancel.FlatAppearance.BorderColor = Color.FromArgb(51, 65, 85);
            btnCancel.Click += (s, e) => this.Close();
            this.Controls.Add(btnCancel);

            btnInstall = new Button
            {
                Text = "Kurulumu Başlat",
                Location = new Point(230, 335),
                Width = 160,
                Height = 34,
                BackColor = Color.FromArgb(30, 215, 96), // Spotify Green
                ForeColor = Color.Black,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                FlatStyle = FlatStyle.Flat,
                Cursor = Cursors.Hand
            };
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            string targetDir = txtInstallDir.Text.Trim();
            if (string.IsNullOrWhiteSpace(targetDir))
            {
                MessageBox.Show("Lütfen geçerli bir kurulum dizini belirtin.", "Uyarı", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            btnInstall.Enabled = false;
            btnBrowse.Enabled = false;
            txtInstallDir.Enabled = false;
            chkDesktop.Enabled = false;
            chkStartMenu.Enabled = false;
            chkLaunch.Enabled = false;
            btnCancel.Enabled = false;

            progressBar.Visible = true;
            progressBar.Value = 5;
            lblStatus.Text = "Kurulum başlatılıyor...";

            bool createDesk = chkDesktop.Checked;
            bool createStart = chkStartMenu.Checked;
            bool autoLaunch = chkLaunch.Checked;

            Thread worker = new Thread(() =>
            {
                try
                {
                    Program.PerformInstall(targetDir, (pct, status) =>
                    {
                        this.Invoke(new Action(() =>
                        {
                            progressBar.Value = Math.Max(0, Math.Min(100, pct));
                            lblStatus.Text = "Yükleniyor: " + status;
                        }));
                    });

                    this.Invoke(new Action(() =>
                    {
                        lblStatus.Text = "Kısayollar oluşturuluyor...";
                    }));
                    Program.CreateShortcuts(targetDir, createDesk, createStart);

                    this.Invoke(new Action(() =>
                    {
                        progressBar.Value = 100;
                        lblStatus.Text = "Kurulum başarıyla tamamlandı!";
                        btnCancel.Text = "Kapat";
                        btnCancel.Enabled = true;

                        if (autoLaunch)
                        {
                            Program.LaunchApp(targetDir);
                        }

                        MessageBox.Show("Müzikal başarıyla kuruldu!", "Kurulum Tamamlandı", MessageBoxButtons.OK, MessageBoxIcon.Information);
                        this.Close();
                    }));
                }
                catch (Exception ex)
                {
                    this.Invoke(new Action(() =>
                    {
                        btnInstall.Enabled = true;
                        btnCancel.Enabled = true;
                        lblStatus.Text = "Hata: " + ex.Message;
                        MessageBox.Show("Kurulum sırasında bir hata oluştu:\n\n" + ex.Message, "Hata", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }));
                }
            });

            worker.IsBackground = true;
            worker.Start();
        }
    }
}
