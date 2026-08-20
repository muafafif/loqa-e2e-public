import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "Harga — LOQA",
  description: "Pilih paket LOQA: Starter, Pro, atau Business. Berlangganan bulanan/tahunan, atau beli Lifetime sekali bayar.",
};

export default function PricingPage() {
  return (
    <main>
      <Navbar />
      <div className="pt-16">
        <Pricing compact={false} />
      </div>

      {/* FAQ */}
      <section className="py-16 px-6 border-t border-white/[0.06]">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-white mb-8 text-center">Pertanyaan Umum</h2>
          <div className="space-y-4">
            {[
              {
                q: "Apa perbedaan Bulanan, Tahunan, dan Lifetime?",
                a: "Bulanan dan Tahunan adalah langganan — Anda membayar secara berkala dan bisa membatalkan kapan saja. Lifetime adalah pembelian satu kali: bayar sekali, pakai selamanya tanpa biaya berulang. Tahunan lebih hemat 20% dibanding Bulanan.",
              },
              {
                q: "Apa itu license key?",
                a: "License key adalah kode unik yang mengaktifkan aplikasi di perangkat Anda. Setiap lisensi berlaku untuk 1 perangkat. Aktivasi memerlukan koneksi internet sekali — setelah itu aplikasi berjalan 100% offline.",
              },
              {
                q: "Bisakah saya pindahkan lisensi ke perangkat lain?",
                a: "Ya. Anda bisa menonaktifkan lisensi dari perangkat lama, lalu mengaktifkannya di perangkat baru. Prosesnya mandiri melalui panel manajemen lisensi.",
              },
              {
                q: "Apa yang terjadi jika langganan saya berakhir?",
                a: "Aplikasi masuk mode terbatas — data Anda tetap aman dan dapat diakses, namun fitur AI tidak tersedia hingga langganan diperbarui. Lisensi Lifetime tidak pernah berakhir.",
              },
              {
                q: "Apakah data saya dikirim ke server?",
                a: "Tidak. LOQA berjalan sepenuhnya lokal. Satu-satunya koneksi ke server adalah validasi license key saat aktivasi — setelah itu tidak ada data yang meninggalkan perangkat Anda.",
              },
              {
                q: "Apa perbedaan LOQA Home dan LOQA Work?",
                a: "LOQA Home untuk kebutuhan personal — AI chat, knowledge base, dan finance dasar. LOQA Work menambahkan laporan P&L, inventory, dan kasir (POS). Paket Pro dan Business mencakup keduanya.",
              },
              {
                q: "Bagaimana cara upgrade dari Starter ke Pro atau Business?",
                a: "Beli license key paket yang lebih tinggi dan masukkan di aplikasi — fitur langsung aktif tanpa install ulang. Untuk langganan aktif, sisa periode tidak direfund.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border border-white/[0.07] rounded-xl p-5 hover:border-white/[0.12] transition-colors">
                <h3 className="text-sm font-semibold text-zinc-200 mb-2">{q}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
