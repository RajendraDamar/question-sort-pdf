# Arsitektur QuestionSort PDF

## Sasaran

1. Aplikasi desktop dan pemrosesan tetap ringan.
2. Pengolahan gambar dilakukan secara lokal, tanpa layanan cloud.
3. OCR, pengurutan, verifikasi pengguna, dan ekspor PDF dipisahkan.
4. Ketidakpastian terlihat; aplikasi tidak boleh diam-diam menganggap hasil OCR pasti benar.
5. Setiap halaman PDF dapat ditelusuri kembali ke gambar sumber.

## Lapisan aplikasi

### Shell desktop

Tauri 2 memakai WebView sistem. Hanya perintah native yang didaftarkan secara eksplisit yang dapat dipanggil dari antarmuka. Hak akses sistem harus tetap minimal.

### Antarmuka

Folder src/ menggunakan TypeScript, HTML, dan CSS biasa tanpa framework UI besar. Bahasa antarmuka utama adalah Bahasa Indonesia. Pratinjau gambar dibuat dengan ukuran kecil untuk menghemat memori.

### Logika pengurutan

Modul src/domain/ordering.ts menjalankan pengurutan numerik deterministik serta pemeriksaan nomor kosong, nomor ganda, dan kemungkinan celah. Nama berkas dan waktu pengiriman WhatsApp hanya metadata pendukung, bukan dasar urutan utama.

### Layanan native

- **Pemeriksaan gambar:** validasi jalur, format, ukuran berkas, dan dimensi; buat pratinjau JPEG kecil.
- **OCR:** menjalankan Tesseract lokal dengan bahasa Indonesia dan Inggris. TSV OCR dipakai untuk mendapatkan teks, posisi, kandidat nomor, dan nilai pengenalan.
- **Penyelesaian kandidat:** kandidat nomor disusun menurut posisi baca dengan aturan yang eksplisit. Kandidat tetap wajib diperiksa pengguna.
- **Ekspor PDF:** memproses satu gambar penuh pada satu waktu, mengubah gambar menjadi JPEG yang kompatibel, menulis halaman A4 ke PDF, lalu memvalidasi berkas sebelum menyatakan berhasil.

### Penyimpanan

Status kumpulan gambar saat ini berada di memori selama sesi. Penyimpanan proyek yang dapat dibuka kembali serta manifest ekspor masih menjadi pekerjaan lanjutan. Jangan menyimpan gambar beresolusi penuh ke basis data.

## Kontrak pengurutan

- Bandingkan nomor sebagai angka: 2 mendahului 10.
- Nomor yang tidak terbaca tetap belum diketahui, bukan dianggap nol.
- Nomor ganda tetap dalam urutan stabil dan ditandai untuk ditinjau.
- Celah nomor merupakan peringatan, bukan bukti bahwa gambar hilang.
- Sampul, diagram, gambar tanpa nomor, serta halaman lanjutan perlu ditempatkan setelah pemeriksaan.
- Pengguna harus menyatakan sudah memeriksa urutan sebelum ekspor.
- Jangan menganggap skor OCR atau kesepakatan model sebagai bukti bahwa urutan benar.

## Batas ukuran dan memori

- Tidak ada runtime React/Vue, Python, model visi, Ollama, atau server yang selalu berjalan.
- Gunakan Tesseract dari sistem dan hanya data bahasa yang diperlukan.
- Pratinjau diturunkan ukurannya.
- Ekspor PDF memproses halaman satu per satu, bukan memuat semua foto penuh sekaligus.
- Ukur installer, waktu startup, memori idle, dan memori puncak pada build rilis sebelum menetapkan angka performa.

## Keamanan berkas

- Validasi jalur dan ekstensi gambar di sisi native.
- Escape nama berkas sebelum memasukkannya ke HTML.
- Pakai dialog sistem untuk memilih gambar dan tujuan simpan.
- Gambar sumber tidak diubah nama, ditimpa, atau dihapus.
- PDF ditulis melalui berkas sementara dan baru dipindahkan ke tujuan setelah berhasil dibuat.
- Pemrosesan normal tidak membutuhkan akses jaringan.
