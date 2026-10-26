# QuestionSort PDF

Aplikasi desktop lokal yang ringan untuk mengurutkan foto soal berdasarkan nomor yang tercetak, memeriksa urutannya, lalu menyimpan kumpulan gambar sebagai PDF.

**Prinsip produk:** OCR memberikan usulan; pemeriksaan deterministik menandai ketidakkonsistenan; pengguna memeriksa keputusan yang meragukan. Aplikasi tidak boleh diam-diam menganggap urutan yang belum pasti sebagai benar.

## Status proyek

**OCR lokal dan ekspor PDF native sudah terhubung.** Antarmuka menggunakan Bahasa Indonesia serta mendukung impor gambar, pratinjau, pengisian nomor manual, pengurutan numerik, peringatan nomor ganda/celah, dan pemindahan gambar. OCR berjalan melalui Tesseract; PDF dibuat oleh aplikasi. Tetap lakukan pemeriksaan visual sebelum menyimpan PDF.

## Teknologi

- Tauri 2 sebagai kerangka desktop.
- TypeScript tanpa framework UI + Vite.
- Rust untuk layanan native.
- Tesseract OCR dengan data bahasa Indonesia dan Inggris yang dipasang pada sistem.
- Peti image untuk membaca gambar dan membuat pratinjau / gambar PDF.
- Dialog native Tauri untuk memilih foto dan lokasi simpan.
- Tanpa React, Python runtime, layanan latar belakang, API cloud, atau model visi yang dibundel.

## Persyaratan pengembangan

- Node.js 22 atau versi LTS kompatibel dan npm.
- Toolchain Rust stable dan Cargo.
- Prasyarat desktop Tauri untuk Linux, termasuk WebKitGTK 4.1.
- Tesseract tersedia di PATH dengan data bahasa ind, eng, dan osd.

## Menjalankan

Pratinjau antarmuka melalui peramban:

    npm install
    npm run dev

Menjalankan aplikasi desktop native:

    npm run tauri dev

Pemeriksaan frontend:

    npm run check
    npm test
    npm run build

Tes Rust:

    cd src-tauri
    cargo fmt --check
    cargo test

Membuat paket release:

    npm run tauri build

## Privasi dan penanganan berkas

- Pengolahan gambar dilakukan secara lokal.
- OCR membaca berkas yang dipilih pengguna; gambar tidak diunggah ke layanan eksternal.
- Pratinjau dibuat dalam ukuran kecil untuk mengurangi pemakaian memori.
- Foto sumber tidak diubah nama, ditimpa, atau dihapus.
- PDF disimpan ke tujuan yang dipilih pengguna.
- Tidak ada pemrosesan melalui model daring.

## Dokumentasi

- docs/ARCHITECTURE.md — batas dan desain teknis.
- docs/ROADMAP.md — rencana pengembangan dan kriteria verifikasi.

## Lisensi

Lisensi distribusi belum dipilih. Jangan mendistribusikan ulang hingga pemilik memilih lisensi proyek.
