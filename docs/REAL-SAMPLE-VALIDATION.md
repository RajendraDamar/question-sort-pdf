# Validasi sampel foto soal nyata

Tanggal pengujian: 27 Oktober 2026.

## Sampel dan pertanyaan yang diuji

Satu kumpulan berisi 22 foto JPEG dari lembar soal Matematika diuji secara lokal. Foto-foto memiliki footer `Matematika | N`, dengan halaman cetak 1 sampai 22. Beberapa foto memuat lebih dari satu nomor soal atau rentang soal yang berlanjut di halaman berikutnya.

## Hasil

- Nomor halaman pada footer berhasil ditemukan pada **22/22 foto**.
- Nomor footer cocok dengan halaman cetak yang diharapkan pada **22/22 foto**.
- Pengujian dilakukan memakai Tesseract lokal dengan bahasa Indonesia dan Inggris; teks, posisi, dan nomor dari footer diperiksa terpisah dari nomor soal di isi halaman.
- Nomor soal di badan halaman tidak cocok untuk dijadikan nomor halaman: sebagian foto berisi beberapa soal, sehingga nomor soal tumpang tindih di antara foto.
- Pemeriksaan lanjutan menemukan bahwa mode sparse-text dapat mengira teks resep "250 gram" sebagai nomor soal pada halaman cetak 3. Mode tata letak standar mengenali label sebenarnya "4. DIMSUM". Karena itu, deteksi nomor soal sekarang memakai PSM 3 sedangkan deteksi footer tetap memakai PSM 11; angka tanpa tanda baca eksplisit tidak diterima sebagai label soal.
- Tes regresi tambahan memastikan footer di kanan-bawah dapat dibaca dan nomor soal di badan halaman tidak dianggap sebagai nomor footer.

## Batas kesimpulan

Hasil 22/22 berlaku untuk kumpulan ini, bukan jaminan untuk semua jenis dokumen. Kumpulan tanpa nomor halaman tercetak, footer yang terpotong, foto miring/gelap, atau campuran lebih dari satu dokumen tetap memerlukan pemeriksaan.

## Kebijakan produk berdasarkan hasil ini

1. Gunakan nomor halaman sumber yang tercetak sebagai kunci deterministik utama saat tersedia.
2. Simpan nomor soal secara terpisah sebagai petunjuk isi, bukan pengganti nomor halaman.
3. Jangan menyembunyikan halaman yang belum dikenali: letakkan setelah halaman bernomor dan tampilkan kebutuhan koreksi.
4. Jika footer tidak ada atau bukti deterministik bertentangan, gunakan koreksi manual sekarang; model visi/reasoning dapat ditambahkan sebagai pembantu opsional setelah benchmark pada kumpulan tanpa footer. Sarankan urutan dan tunjukkan alasan, tetapi jangan otomatis menganggap jawabannya benar.
