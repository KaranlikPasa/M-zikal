#!/usr/bin/env bash
# ==============================================================================
# Müzikal - Linux Kurulum Aracı (Arch Linux, Ubuntu, Debian, Fedora & Diğerleri)
# ==============================================================================

set -e

# Renkli terminal çıktıları
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}======================================================${NC}"
echo -e "${CYAN}   🎵 Müzikal - Linux Kurulum ve Entegrasyon Sihirbazı${NC}"
echo -e "${CYAN}======================================================${NC}"

# Root yetkisi kontrolü
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}[Bilgi] Sistem geneline (/opt/muzikal) kurulum için 'sudo' gereklidir.${NC}"
  echo -e "Yönetici şifreniz istenebilir..."
  exec sudo "$0" "$@"
fi

INSTALL_DIR="/opt/muzikal"
BIN_LINK="/usr/bin/muzikal"
DESKTOP_DIR="/usr/share/applications"
ICONS_BASE="/usr/share/icons/hicolor"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "\n${BLUE}1/4: Sistem Bağımlılıkları Kontrol Ediliyor...${NC}"

# Paket yöneticisi tespiti ve bağımlılık kontrolü
if command -v pacman >/dev/null 2>&1; then
  pacman -S --noconfirm --needed nodejs yt-dlp ffmpeg python python-gobject webkit2gtk-4.1 gst-plugins-good
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update && apt-get install -y nodejs yt-dlp ffmpeg python3 python3-gi gir1.2-webkit2-4.1
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nodejs yt-dlp ffmpeg python3 python3-gobject webkit2gtk4.1
fi

if command -v node >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Node.js kurulu ($(node -v))${NC}"
fi

# yt-dlp kontrolü
if ! command -v yt-dlp >/dev/null 2>&1; then
  echo -e "${YELLOW}[İpucu] yt-dlp henüz kurulu değil. Çevrimdışı indirmeler için 'pacman -S yt-dlp' önerilir.${NC}"
else
  echo -e "${GREEN}✓ yt-dlp müzik motoru hazır${NC}"
fi

echo -e "\n${BLUE}2/4: Uygulama Dosyaları /opt/muzikal Dizinine Kopyalanıyor...${NC}"
mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/discord-rpc.js" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/public" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/python_app" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/muzikal" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/muzikal.desktop" "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR/Muzikal.png" "$INSTALL_DIR/" 2>/dev/null || true
cp -r "$SCRIPT_DIR/Muzikal.ico" "$INSTALL_DIR/" 2>/dev/null || true
if [ -d "$SCRIPT_DIR/icons" ]; then
  cp -r "$SCRIPT_DIR/icons" "$INSTALL_DIR/"
fi

# İzinleri ayarla
chmod -R 755 "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/muzikal"

echo -e "\n${BLUE}3/4: Sistem Başlatıcısı ve Masaüstü Kısayolu Oluşturuluyor...${NC}"
ln -sf "$INSTALL_DIR/muzikal" "$BIN_LINK"

mkdir -p "$DESKTOP_DIR"
cp "$INSTALL_DIR/muzikal.desktop" "$DESKTOP_DIR/muzikal.desktop"
chmod 644 "$DESKTOP_DIR/muzikal.desktop"

echo -e "\n${BLUE}4/4: Yüksek Çözünürlüklü Simgeler Yükleniyor...${NC}"
for size in 16 32 48 64 128 256 512; do
  if [ -f "$INSTALL_DIR/icons/${size}x${size}.png" ]; then
    mkdir -p "$ICONS_BASE/${size}x${size}/apps"
    cp "$INSTALL_DIR/icons/${size}x${size}.png" "$ICONS_BASE/${size}x${size}/apps/muzikal.png"
  fi
done

if [ -f "$INSTALL_DIR/Muzikal.png" ]; then
  mkdir -p /usr/share/pixmaps
  cp "$INSTALL_DIR/Muzikal.png" /usr/share/pixmaps/muzikal.png
fi

# Icon ve masaüstü önbelleğini yenile
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$ICONS_BASE" 2>/dev/null || true
fi
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}   ✨ Müzikal Başarıyla Kuruldu!${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Uygulamayı çalıştırmak için:"
echo -e "  - Uygulama menünüzden (App Launcher / Rofi / Wofi / GNOME / KDE) ${CYAN}Müzikal${NC} seçin"
echo -e "  - Veya terminalde sadece ${CYAN}muzikal${NC} komutunu verin."
echo -e ""
echo -e "Kaldırmak isterseniz: ${YELLOW}sudo rm -rf /opt/muzikal /usr/bin/muzikal /usr/share/applications/muzikal.desktop${NC}\n"
