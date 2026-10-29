#!/usr/bin/env python3
# ==============================================================================
# Müzikal - Bağımsız Masaüstü Uygulama Motoru (Native GTK, WebKit & PyWebView)
# Spotify & YouTube Müzik Çalar, Akıllı Mix ve Çevrimdışı İndirici
# ==============================================================================

import os
import sys

# Ensure GStreamer discovers audio sink plugins (pulsesink, autoaudiosink) in user or system path
local_gst_dir = os.path.expanduser("~/.local/lib/gstreamer-1.0")
if os.path.isdir(local_gst_dir):
    cur_gst = os.environ.get("GST_PLUGIN_PATH", "")
    os.environ["GST_PLUGIN_PATH"] = f"{local_gst_dir}:{cur_gst}" if cur_gst else local_gst_dir

import time
import shutil
import signal
import subprocess
import urllib.request
import webbrowser

APP_TITLE = "Müzikal"
SERVER_PORT = 3456
SERVER_URL = f"http://localhost:{SERVER_PORT}"


def find_app_root():
    """Locate the Müzikal installation directory containing server.js."""
    candidates = []
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        candidates.extend([exe_dir, os.path.dirname(exe_dir)])
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        candidates.extend([script_dir, os.path.dirname(script_dir)])

    local_appdata = os.environ.get("LOCALAPPDATA", "")
    if local_appdata:
        candidates.append(os.path.join(local_appdata, "Programs", "Muzikal"))

    # Linux standard directories
    candidates.extend([
        "/opt/muzikal",
        "/usr/lib/muzikal",
        "/usr/share/muzikal",
        os.path.expanduser("~/.local/share/muzikal"),
    ])

    for path in candidates:
        if path and os.path.isfile(os.path.join(path, "server.js")):
            return path

    return candidates[0] if candidates else os.getcwd()


def is_server_running():
    """Check if the Müzikal backend server is already listening on port 3456."""
    try:
        with urllib.request.urlopen(f"{SERVER_URL}/api/version", timeout=1.2) as resp:
            return resp.status == 200
    except Exception:
        return False


def find_node_executable(app_root):
    """Find embedded bin/node or system Node.js executable."""
    system_node = shutil.which("node")
    if system_node:
        return system_node

    candidates = [
        os.path.join(app_root, "bin", "node.exe"),
        os.path.join(app_root, "bin", "node"),
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
        "/usr/bin/node",
        "/usr/local/bin/node",
        "/bin/node",
        "node",
    ]
    for cand in candidates:
        if cand == "node" or os.path.isfile(cand):
            return cand
    return "node"


def start_backend_server(app_root):
    """Start server.js invisibly in the background if not already running."""
    if is_server_running():
        return None

    server_js = os.path.join(app_root, "server.js")
    if not os.path.isfile(server_js):
        return None

    node_exe = find_node_executable(app_root)
    env = os.environ.copy()
    env["PORT"] = str(SERVER_PORT)
    env["MUZIKAL_DESKTOP_MODE"] = "desktop"

    creationflags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    try:
        proc = subprocess.Popen(
            [node_exe, server_js],
            cwd=app_root,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL,
            creationflags=creationflags,
        )
    except Exception:
        return None

    # Wait up to 10 seconds for server to become ready
    for _ in range(50):
        if is_server_running():
            break
        time.sleep(0.2)

    return proc


def get_icon_path(app_root):
    """Find best high-res icon."""
    icon_candidates = [
        os.path.join(app_root, "icons", "512x512.png"),
        os.path.join(app_root, "Muzikal.png"),
        os.path.join(app_root, "public", "logo.png"),
        os.path.join(app_root, "public", "favicon.png"),
        os.path.join(app_root, "Muzikal.ico"),
    ]
    for p in icon_candidates:
        if os.path.isfile(p):
            return p
    return None


def run_gtk_webkit(app_root, server_proc):
    """Native Linux GTK 3 + WebKit2 window with full hardware audio & autoplay support."""
    import gi
    gi.require_version("Gtk", "3.0")
    for ver in ["4.1", "4.0"]:
        try:
            gi.require_version("WebKit2", ver)
            break
        except Exception:
            pass

    from gi.repository import Gtk, WebKit2, GLib, Gdk

    GLib.set_prgname("muzikal")
    GLib.set_application_name("Müzikal")

    win = Gtk.Window(title=APP_TITLE)
    win.set_wmclass("muzikal", "muzikal")
    win.set_default_size(1380, 860)
    win.set_size_request(940, 620)
    win.set_position(Gtk.WindowPosition.CENTER)

    # Dark theme background
    css_provider = Gtk.CssProvider()
    css_provider.load_from_data(b"window { background-color: #0a0b10; }")
    Gtk.StyleContext.add_provider_for_screen(
        Gdk.Screen.get_default(),
        css_provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    )

    icon_path = get_icon_path(app_root)
    if icon_path:
        try:
            win.set_icon_from_file(icon_path)
        except Exception:
            pass

    # Unrestricted Autoplay policy for music playback
    wp = None
    if hasattr(WebKit2, "WebsitePolicies") and hasattr(WebKit2, "AutoplayPolicy"):
        try:
            wp = WebKit2.WebsitePolicies(autoplay=WebKit2.AutoplayPolicy.ALLOW)
        except Exception:
            pass

    if wp is not None:
        webview = WebKit2.WebView(website_policies=wp)
    else:
        webview = WebKit2.WebView()

    settings = webview.get_settings()
    settings.set_enable_media_stream(True)
    settings.set_enable_mediasource(True)
    settings.set_enable_webaudio(True)
    settings.set_enable_javascript(True)
    settings.set_enable_smooth_scrolling(True)

    if hasattr(settings, "set_enable_encrypted_media"):
        settings.set_enable_encrypted_media(True)
    if hasattr(settings, "set_enable_media"):
        settings.set_enable_media(True)
    if hasattr(settings, "set_enable_media_capabilities"):
        settings.set_enable_media_capabilities(True)
    if hasattr(settings, "set_media_playback_allows_inline"):
        settings.set_media_playback_allows_inline(True)
    if hasattr(settings, "set_media_playback_requires_user_gesture"):
        settings.set_media_playback_requires_user_gesture(False)
    if hasattr(settings, "set_hardware_acceleration_policy"):
        settings.set_hardware_acceleration_policy(WebKit2.HardwareAccelerationPolicy.ON_DEMAND)

    # Update window title when song title changes
    def on_title_changed(view, param):
        current_title = view.get_title()
        if current_title:
            win.set_title(f"{current_title} - Müzikal" if "Müzikal" not in current_title else current_title)
        else:
            win.set_title(APP_TITLE)

    webview.connect("notify::title", on_title_changed)

    # Handle external popups / new windows
    def on_create(view, nav_action):
        uri = nav_action.get_request().get_uri()
        if uri and not uri.startswith("http://127.0.0.1:3456") and not uri.startswith("http://localhost:3456"):
            webbrowser.open(uri)
            return None
        return None

    webview.connect("create", on_create)

    # Clean exit
    def on_destroy(*args):
        if server_proc is not None:
            try:
                server_proc.terminate()
            except Exception:
                pass
        Gtk.main_quit()

    win.connect("destroy", on_destroy)

    scrolled = Gtk.ScrolledWindow()
    scrolled.add(webview)
    win.add(scrolled)

    webview.load_uri(SERVER_URL)
    win.show_all()

    def handle_signal(sig, frame):
        GLib.idle_add(Gtk.main_quit)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    Gtk.main()
    return True


def run_pywebview(app_root, server_proc):
    """PyWebView launcher (Windows or fallback)."""
    import webview

    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Muzikal.Desktop.1.4.6")
        except Exception:
            pass

    icon_path = get_icon_path(app_root)

    window = webview.create_window(
        title=APP_TITLE,
        url=SERVER_URL,
        width=1380,
        height=860,
        min_size=(940, 620),
        background_color="#0a0b10",
        text_select=False,
    )

    try:
        if icon_path:
            webview.start(icon=icon_path)
        else:
            webview.start()
    finally:
        if server_proc is not None:
            try:
                server_proc.terminate()
            except Exception:
                pass
    return True


def run_app_mode_browser(app_root, server_proc):
    """Launch dedicated standalone app window using Chromium/Chrome/Brave/Edge."""
    browsers = [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "brave-browser",
        "brave",
        "microsoft-edge-stable",
        "microsoft-edge",
        "vivaldi",
    ]
    for b in browsers:
        path = shutil.which(b)
        if path:
            args = [
                path,
                f"--app={SERVER_URL}",
                "--name=muzikal",
                "--class=muzikal",
                f"--window-size=1380,860",
            ]
            try:
                proc = subprocess.Popen(args)
                proc.wait()
                return True
            except Exception:
                pass
    return False


def run_default_browser(app_root, server_proc):
    """Absolute fallback: open default browser."""
    webbrowser.open(SERVER_URL)
    if server_proc is not None:
        try:
            server_proc.wait()
        except KeyboardInterrupt:
            server_proc.terminate()
    return True


def main():
    app_root = find_app_root()
    server_proc = start_backend_server(app_root)

    # 1. First priority on Linux: Native GTK 3 + WebKit2 window
    if sys.platform.startswith("linux"):
        try:
            run_gtk_webkit(app_root, server_proc)
            return
        except Exception:
            pass

    # 2. PyWebView
    try:
        run_pywebview(app_root, server_proc)
        return
    except Exception:
        pass

    # 3. Dedicated browser app-mode window
    if run_app_mode_browser(app_root, server_proc):
        if server_proc is not None:
            try:
                server_proc.terminate()
            except Exception:
                pass
        return

    # 4. Final fallback
    run_default_browser(app_root, server_proc)


if __name__ == "__main__":
    main()
