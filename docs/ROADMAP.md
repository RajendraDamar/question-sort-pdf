# Peta jalan dan kriteria penerimaan

## Fase 0 — Fondasi

- [x] Tauri 2 + TypeScript tanpa framework UI
- [x] Antarmuka responsif dalam Bahasa Indonesia
- [x] Impor gambar batch, pratinjau, pengisian nomor manual, pengurutan berdasarkan footer halaman, dan kontrol pemindahan
- [x] Pisahkan nomor halaman sumber dari nomor soal pada data dan antarmuka
- [x] Peringatan nomor kosong, nomor ganda, dan celah yang mungkin
- [x] Foto sumber tetap utuh
- [x] Dialog sistem untuk memilih gambar dan tujuan ekspor
- [x] OCR Tesseract lokal terhubung
- [x] Pembuat PDF native dan tes pembacaan PDF
- [x] Shortcut desktop lokal tersedia
- [ ] Penyimpanan proyek yang dapat dibuka kembali

## Fase 1 — Model proyek

- Simpan nama sumber, metadata perubahan, timestamp WhatsApp jika dapat dikenali dari pola nama berkas, dan hash isi.
- Bedakan konten duplikat persis dari berkas yang hanya memiliki nama/ukuran sama.
- Tambahkan proyek yang dapat dibuka kembali dan manifest yang dapat diaudit.
- Jangan pernah mengganti nama berkas sumber.

**Penerimaan:** setiap masukan tercatat satu kali atau secara eksplisit dikeluarkan; seluruh gambar beresolusi penuh tidak harus berada di memori bersamaan.

## Fase 2 — OCR lokal

- Benchmark Tesseract pada foto soal nyata, bukan hanya gambar sintetis.
- [x] Kenali nomor halaman sumber dari footer bawah-kanan secara terpisah dari nomor soal.
- Kenali nomor soal memakai teks, posisi, dan konteks sekitar.
- Pertahankan bukti footer OCR serta kandidat nomor soal alternatif.
- Ulangi preprocessing hanya jika menambah bukti.
- Seluruh antarmuka dan petunjuk pengguna menggunakan Bahasa Indonesia.

**Penerimaan:** kandidat dapat ditelusuri ke gambar sumber dan bukti teks/posisi.

## Fase 3 — Verifikasi urutan

- [x] Utamakan nomor halaman sumber yang eksplisit, bukan menyamakan nomor soal dengan urutan foto.
- [x] Letakkan halaman tanpa nomor sumber yang terbaca di bagian akhir untuk ditinjau; izinkan koreksi manual.
- Tandai nomor halaman sumber ganda/celah dan halaman yang belum dikenali.
- Tambahkan pencocokan urutan berbasis isi/kelanjutan untuk halaman tanpa footer.
- Pertimbangkan model visi opsional hanya untuk kasus yang tetap ambigu setelah bukti deterministik; jangan bundel model ke installer.
- Tampilkan pratinjau lengkap dan koreksi langsung.
- Wajibkan persetujuan eksplisit untuk urutan akhir.

**Penerimaan:** nilai OCR tidak pernah dianggap sebagai bukti mutlak kebenaran.

## Fase 4 — Ekspor PDF

- Buat halaman sesuai urutan yang ditinjau pengguna.
- Tangani orientasi dan ukuran halaman secara konsisten.
- Validasi struktur PDF dan jumlah halaman.
- Simpan ke tujuan yang dipilih, tanpa menyentuh gambar sumber.
- Pastikan berkas akhir dapat dibuka kembali.

**Penerimaan:** struktur PDF dan jumlah halaman lulus pemeriksaan sebelum aplikasi menyatakan sukses.

## Fase 5 — Paket dan performa

- Buat build rilis untuk setiap sistem operasi sasaran.
- Jalankan pemeriksaan antarmuka dan tes native melalui CI.
- Ukur ukuran installer, waktu startup, memori idle, memori puncak OCR, dan waktu pemrosesan batch.
- Putuskan apakah Tesseract dibundel atau memerlukan pemasangan sistem dengan membandingkan ukuran paket dan kemudahan penggunaan.

**Penerimaan:** artefak rilis teruji, dependensi terdokumentasi, proses instalasi jelas, tidak ada koneksi jaringan yang tidak diharapkan, dan tes regresi lulus.
