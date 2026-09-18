# Photosheet 📸

Photosheet is an Android application designed for creating and printing passport, visa, ID, and custom photo sheets quickly and accurately. It features an interactive layout engine, precise physical mm-to-pixel sizing, image adjustments, and direct PDF/print export.

---

## ✨ Features

- **Custom & Standard Layouts**: Generate photo sheets with configurable rows, columns, margins, and gaps.
- **Precise Print Sizing**: Millimeter-accurate photo and paper dimensions for passport and ID requirements.
- **Interactive Editing**:
  - Image cropping, scaling, and alignment.
  - Multi-slot support for single or multiple photos on one sheet.
- **Export & Print**:
  - Direct printing using Android's native `PrintManager`.
  - Export to high-resolution images or PDF documents.
- **Hybrid Architecture**: Modern responsive UI running on an optimized Android WebView backed by native Java bridges.

---

## 🛠️ Tech Stack

- **Platform**: Android (Min SDK: 24, Target SDK: 34)
- **Language**: Java & Vanilla JavaScript / CSS3 / HTML5
- **Build System**: Gradle
- **Architecture**: Android Native + WebView JavaScript Bridge (`PPSBridgeInterface`)

---

## 🚀 Getting Started

### Prerequisites

- [Android Studio](https://developer.android.com/studio) Ladybug or newer
- JDK 17+
- Android SDK (API Level 34)

### Building from Source

1. Clone the repository:
   ```bash
   git clone https://github.com/anuragkeshav/photosheet.git
   cd photosheet
   ```

2. Open the project in **Android Studio** or build via CLI:
   ```bash
   # Debug APK
   ./gradlew assembleDebug

   # Release APK
   ./gradlew assembleRelease
   ```

3. The generated APK will be available in:
   ```
   app/build/outputs/apk/
   ```

---

## 📱 Permissions

- `CAMERA`: Capture photos directly within the app.
- `READ_MEDIA_IMAGES` / `READ_EXTERNAL_STORAGE`: Select photos from the device gallery.
- `WRITE_EXTERNAL_STORAGE` (API $\le$ 28): Save generated photo sheets and PDFs to device storage.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
