const BASE_URL = "http://localhost:8001/api/license";

export type LicenseStatus = "valid" | "revoked" | "expired" | "not_activated";

export interface LicenseState {
  status: LicenseStatus;
  tier?: string;
  expires_at?: string;
  license_key?: string;
}

export async function getLicenseStatus(): Promise<LicenseState> {
  const res = await fetch(`${BASE_URL}/status`);
  return res.json();
}

export async function activateLicense(key: string): Promise<LicenseState> {
  const res = await fetch(`${BASE_URL}/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Activation failed");
  }
  return res.json();
}
