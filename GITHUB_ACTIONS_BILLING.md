# GitHub Actions Billing — Catatan Tarif

Sumber: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions

---

## Tarif Per Menit (Private Repo)

| OS | Tarif |
|----|-------|
| Linux 2-core (x64) | $0.006 / menit |
| Linux 2-core (arm64) | $0.005 / menit |
| Windows 2-core (x64) | $0.010 / menit |
| Windows 2-core (arm64) | $0.010 / menit |
| macOS 3-core / 4-core | $0.062 / menit |

> **Catatan:** Public repo dan self-hosted runner **tidak dikenakan biaya**.

---

## Free Tier (Per Bulan)

| Plan | Menit | Artifact Storage | Cache Storage |
|------|-------|-----------------|---------------|
| GitHub Free | 2.000 | 500 MB | 10 GB |
| GitHub Pro | 3.000 | 1 GB | 10 GB |
| GitHub Free (Org) | 2.000 | 500 MB | 10 GB |
| GitHub Team | 3.000 | 2 GB | 10 GB |
| GitHub Enterprise Cloud | 50.000 | 50 GB | 10 GB |

---

## Storage Tambahan

- Artifact/cache di luar free tier: **$0.07 per GiB per bulan**
- Dihitung per jam (GB-Hours), diakumulasi sepanjang siklus billing

---

## Estimasi Biaya Build LOQA (Private Repo)

| Job | Runner | Estimasi durasi | Tarif | Estimasi biaya |
|-----|--------|----------------|-------|----------------|
| Backend + Tauri macOS | `macos-latest` | ~30 menit | $0.062/mnt | ~$1.86 / run |
| Backend + Tauri Windows | `windows-latest` | ~20 menit | $0.010/mnt | ~$0.20 / run |
| **Total per run** | | | | **~$2.06 / run** |

> Free tier 2.000 menit/bulan habis setelah sekitar **8–9 run** (macOS mengkonsumsi lebih banyak).

---

## Opsi Hemat Biaya

1. **Jadikan repo public** — unlimited minutes, gratis sepenuhnya
2. **Self-hosted runner** — jalankan runner di Mac/Windows lokal, gratis
3. **Trigger hanya pada tag `v*`** — tidak build setiap push, hanya saat release
4. **Tambah payment method** — bayar sesuai pemakaian di luar free tier
