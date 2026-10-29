# Maintainer: KaranlikPasa <https://github.com/KaranlikPasa>
pkgname=muzikal
pkgver=1.4.4
pkgrel=3
pkgdesc="Spotify & YouTube Müzik Çalar, Akıllı Mix ve Çevrimdışı İndirici"
arch=('any')
url="https://github.com/KaranlikPasa/M-zikal"
license=('MIT')
depends=('nodejs' 'yt-dlp' 'ffmpeg' 'python' 'python-gobject' 'webkit2gtk-4.1' 'gst-plugins-good')
optdepends=(
    'python-pywebview: Alternatif WebKit pencere motoru'
)
provides=('muzikal')
conflicts=('muzikal')

package() {
    install -d "${pkgdir}/opt/muzikal"
    cp -r "${srcdir}/.."/{server.js,discord-rpc.js,Muzikal.png,Muzikal.ico,public,python_app,muzikal,muzikal.desktop,icons,README.md} "${pkgdir}/opt/muzikal/" 2>/dev/null || \
    cp -r "${startdir}"/{server.js,discord-rpc.js,Muzikal.png,Muzikal.ico,public,python_app,muzikal,muzikal.desktop,icons,README.md} "${pkgdir}/opt/muzikal/"
    chmod -R 755 "${pkgdir}/opt/muzikal"
    chmod +x "${pkgdir}/opt/muzikal/muzikal"
    chmod +x "${pkgdir}/opt/muzikal/python_app/muzikal_desktop.py" 2>/dev/null || true

    # Wrapper executable
    install -d "${pkgdir}/usr/bin"
    ln -sf /opt/muzikal/muzikal "${pkgdir}/usr/bin/muzikal"

    # Desktop shortcut
    install -Dm644 "${pkgdir}/opt/muzikal/muzikal.desktop" "${pkgdir}/usr/share/applications/muzikal.desktop"

    # Icons
    for size in 16 32 48 64 128 256 512; do
        if [ -f "${pkgdir}/opt/muzikal/icons/${size}x${size}.png" ]; then
            install -Dm644 "${pkgdir}/opt/muzikal/icons/${size}x${size}.png" \
                "${pkgdir}/usr/share/icons/hicolor/${size}x${size}/apps/muzikal.png"
        fi
    done
    if [ -f "${pkgdir}/opt/muzikal/Muzikal.png" ]; then
        install -Dm644 "${pkgdir}/opt/muzikal/Muzikal.png" "${pkgdir}/usr/share/pixmaps/muzikal.png"
    fi
}
