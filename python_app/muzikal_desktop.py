import os
import sys
import time
import ctypes
import shutil
import signal
import socket
import subprocess
import urllib.request
import webview

APP_TITLE = "Müzikal PRO v1.4.4"
SERVER_PORT = 3456
SERVER_URL = f"http://127.0.0.1:{SERVER_PORT}"


def find_app_root():
    """Locate the Müzikal installation directory containing server.js."""
    candidates = []
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        candidates.extend([
            exe_dir,
            os.path.dirname(exe_dir),
        ])
    else:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        candidates.extend([
            script_dir,
            os.path.dirname(script_dir),
        ])

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
    env["MUZIKAL_DESKTOP_MODE"] = "python"

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

    # Wait up to 8 seconds for server to become ready
    for _ in range(40):
        if is_server_running():
            break
        time.sleep(0.2)

    return proc


def set_windows_app_id():
    """Ensure Windows taskbar groups the Python app with its own icon."""
    if sys.platform == "win32":
        try:
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(
                "Muzikal.Desktop.Python.1.4.3"
            )
        except Exception:
            pass


def main():
    set_windows_app_id()
    app_root = find_app_root()
    server_proc = start_backend_server(app_root)

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
        # Check high-res PNG for Linux, ICO for Windows
        icon_candidates = [
            os.path.join(app_root, "public", "logo.png"),
            os.path.join(app_root, "Muzikal.png"),
            os.path.join(app_root, "public", "favicon.png"),
            os.path.join(app_root, "Muzikal.ico"),
        ]
        chosen_icon = next((p for p in icon_candidates if os.path.isfile(p)), None)
        if chosen_icon:
            webview.start(icon=chosen_icon)
        else:
            webview.start()
    finally:
        if server_proc is not None:
            try:
                server_proc.terminate()
            except Exception:
                pass


if __name__ == "__main__":
    main()
