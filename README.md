# 🎵 Müzikal

> YouTube ve Spotify destekli, modern masaüstü ve Android müzik çalar uygulaması.

![Müzikal](https://img.shields.io/badge/Platform-Windows%20%7C%20Android-1ed760?style=for-the-badge&logo=android)
![Version](https://img.shields.io/badge/S%C3%BCr%C3%BCm-1.2.2-blue?style=for-the-badge)
![License](https://img.shields.io/badge/Lisans-MIT-green?style=for-the-badge)

---

## ✨ Özellikler

- 🔍 **Milyonlarca Şarkı & Klip Arama:** YouTube üzerinden doğrudan yüksek kaliteli arama ve anında müzik akışı (API anahtarı gerekmez).
- 📋 **Izgara / Liste Görünümü Değiştirici (Yeni):** Müzikleri ister şık albüm kartları (Grid) şeklinde, isterseniz Spotify tarzı dikey liste (List) şeklinde tek tuşla görüntüleyin.
- 🛡️ **Akıllı Kısıtlama & Alternatif Kaynak Motoru (Yeni):** YouTube'da gömülü oynatması kısıtlı parçalar artık doğrudan atlanmaz; şarkının alternatif stüdyo/ses kaynağı otomatik olarak bulunup kesintisiz oynatılır.
- 🟢 **Spotify Çalma Listesi Aktarma:** Spotify çalma listesi bağlantınızı (`https://open.spotify.com/playlist/...`) yapıştırın, saniyeler içinde kitaplığınıza eklensin.
- 💾 **Çevrimdışı Dinleme & İndirme:** Şarkıları veya tüm çalma listelerini tek tıkla çevrimdışı dinlemek üzere indirin.
- 📱 **Yenilenen Android Arayüzü:** Telefon ekranlarına kusursuz oturan responsive tasarım, şık cam arama çubuğu, çakışmayan yüzen mini çalar ve alt dolaşım çubuğu.
- 🔄 **Doğrudan İndirme & Güncelleme:** Yeni sürüm bildirimi geldiğinde "Güncelle"ye dokunduğunuzda telefon doğrudan tarayıcıdan en güncel APK'yı indirir.
- ❤️ **Favoriler & Özel Çalma Listeleri:** Kendi müzik listelerinizi oluşturun ve favorilerinizi kaydedin.
- 🎛️ **Gelişmiş Çalar Kontrolleri:** Karışık çal (Shuffle), Tekrar çal (Loop), Sıradaki parçalar listesi ve ses görselleştiricisi.

---

## 📥 İndir (Releases)

En güncel sürümleri doğrudan [GitHub Releases](https://github.com/KaranlikPasa/M-zikal/releases/latest) sayfasından indirebilirsiniz:

| Platform | Dosya | Açıklama |
| :--- | :--- | :--- |
| **Android** | [📱 **Muzikal.apk**](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.2.2/Muzikal.apk) | Yenilenen mobil arayüz ile telefonunuza yükleyin. |
| **Windows** | [💾 **Muzikal-Windows-x64.zip**](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.2.2/Muzikal-Windows-x64.zip) | Kurulum gerektirmez. Node.js ve yt-dlp dahildir. İndirip zip'ten çıkarın ve `Muzikal.bat` ile başlatın. |

---

## 🚀 Başlangıç & Kullanım

### 📱 Android
1. [`Muzikal.apk`](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.2.2/Muzikal.apk) dosyasını telefonunuza indirip yükleyin.
2. PC uygulamanız evdeki Wi-Fi ağında açıkken telefon otomatik olarak PC'nize bağlanır ve anlık senkronize olur. Dışarıdayken veya PC kapalıyken bağımsız çevrimdışı modda çalışır.

### 🪟 Windows (Hazır Paket)
1. [`Muzikal-Windows-x64.zip`](https://github.com/KaranlikPasa/M-zikal/releases/download/v1.2.2/Muzikal-Windows-x64.zip) dosyasını indirin ve bir klasöre çıkartın.
2. Klasör içindeki **`Muzikal.bat`** (veya arka planda sessiz açılması için **`Muzikal.vbs`**) dosyasına çift tıklayın.
3. Node.js veya başka hiçbir şey yüklemenize gerek yoktur; yerleşik taşınabilir motor ile uygulama masaüstü penceresi olarak anında açılır.

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

---

## ⚖️ Yasal Uyarı & Feragatname (Disclaimer)

Bu proje yalnızca **eğitim, araştırma ve kişisel kullanım** amacıyla geliştirilmiştir. 
- Bu uygulama bünyesinde herhangi bir telifli ses veya müzik dosyası barındırmaz.
- Tüm medya aramaları ve oynatmaları üçüncü taraf platformların herkese açık arayüzleri üzerinden yürütülür.
- Kullanıcıların indirdiği veya oynattığı içeriklerden doğabilecek her türlü sorumluluk kullanıcının kendisine aittir.
