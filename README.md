# 🎵 Müzikal

> YouTube ve Spotify destekli, modern masaüstü ve Android müzik çalar uygulaması.

![Müzikal](https://img.shields.io/badge/Platform-Windows%20%7C%20Android-1ed760?style=for-the-badge&logo=android)
![Version](https://img.shields.io/badge/S%C3%BCr%C3%BCm-1.1.0-blue?style=for-the-badge)
![License](https://img.shields.io/badge/Lisans-MIT-green?style=for-the-badge)

---

## ✨ Özellikler

- 🔍 **Milyonlarca Şarkı & Klip Arama:** YouTube üzerinden doğrudan yüksek kaliteli arama ve anında müzik akışı (API anahtarı gerekmez).
- 🟢 **Spotify Çalma Listesi Aktarma:** Spotify çalma listesi bağlantınızı (`https://open.spotify.com/playlist/...`) yapıştırın, saniyeler içinde kitaplığınıza eklensin.
- 💾 **Çevrimdışı Dinleme & İndirme:** Şarkıları veya tüm çalma listelerini tek tıkla çevrimdışı dinlemek üzere indirin.
- 📱 **Android APK Desteği:** İster bilgisayarda bağımsız masaüstü penceresi olarak, ister telefonunuzda `Muzikal.apk` ile kullanın.
- 🔄 **Canlı Ağ Güncellemesi:** Evdeki Wi-Fi ağındaki diğer bilgisayarlar (`http://<ip>:3456`) ve telefonlar canlı olarak bağlanabilir.
- ❤️ **Favoriler & Özel Çalma Listeleri:** Kendi müzik listelerinizi oluşturun ve favorilerinizi kaydedin.
- 🎛️ **Gelişmiş Çalar Kontrolleri:** Karışık çal (Shuffle), Tekrar çal (Loop), Sıradaki parçalar listesi ve ses görselleştiricisi.

---

## 🚀 Başlangıç & Kurulum

### Windows Masaüstü
1. Bu depoyu indirin veya klonlayın.
2. `Muzikal.bat` (veya `Muzikal.vbs`) dosyasına çift tıklayın.
3. Uygulama bağımsız bir masaüstü penceresi olarak açılacaktır.

### Android
- `Muzikal.apk` dosyasını telefonunuza yükleyin ve açın.
- PC sunucunuz açıkken aynı Wi-Fi'daysanız anında canlı güncellemeleri alır, dışarıdayken bağımsız çevrimdışı modda çalışır.

---

## ⌨️ Klavye Kısayolları

| Tuş | İşlev |
| :--- | :--- |
| `Space` | Oynat / Duraklat |
| `Sağ Ok` / `Sol Ok` | 5 saniye ileri / geri sar |
| `Yukarı` / `Aşağı Ok` | Ses seviyesi artır / azalt |
| `M` | Sesi Aç / Kapat (Mute) |
| `L` | Favorilere Ekle / Çıkar |

---

## 🛠️ Teknolojiler
- **Ön Yüz:** HTML5, CSS3 Glassmorphism, Vanilla JavaScript
- **Arka Yüz:** Node.js HTTP Server, IPv4 first resolver
- **Ses Motoru:** YouTube IFrame Player API & Native HTML5 Audio
- **Mobil:** Android WebView Native Container (API 24 - 36)
