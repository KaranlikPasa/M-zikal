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

## 📥 İndir (Releases)

En güncel sürümleri doğrudan [GitHub Releases](https://github.com/KaranlikPasa/M-zikal/releases/tag/v1.1.0) sayfasından indirebilirsiniz:

| Platform | Dosya | Açıklama |
| :--- | :--- | :--- |
| **Windows** | [💾 **Muzikal-Windows-x64.zip**](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.1.0/Muzikal-Windows-x64.zip) | Kurulum gerektirmez. Node.js ve yt-dlp dahildir. İndirip zip'ten çıkarın ve `Muzikal.bat` ile başlatın. |
| **Android** | [📱 **Muzikal.apk**](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.1.0/Muzikal.apk) | Telefonunuza indirip kurun. |

---

## 🚀 Başlangıç & Kullanım

### 🪟 Windows (Hazır Paket)
1. [`Muzikal-Windows-x64.zip`](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.1.0/Muzikal-Windows-x64.zip) dosyasını indirin ve bir klasöre çıkartın.
2. Klasör içindeki **`Muzikal.bat`** (veya arka planda sessiz açılması için **`Muzikal.vbs`**) dosyasına çift tıklayın.
3. Node.js veya başka hiçbir şey yüklemenize gerek yoktur; yerleşik taşınabilir motor ile uygulama masaüstü penceresi olarak anında açılır.

### 📱 Android
1. [`Muzikal.apk`](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.1.0/Muzikal.apk) dosyasını telefonunuza yükleyin ve açın.
2. PC uygulamanız evdeki Wi-Fi ağında açıkken telefon otomatik olarak PC'nize bağlanır ve en güncel arayüzü çeker. Dışarıdayken ise bağımsız çevrimdışı modda çalışır.

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
