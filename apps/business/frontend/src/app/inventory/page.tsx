"use client";

import { I18nProvider } from "@/lib/i18n";
import { LockProvider } from "@/lib/LockContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { InventoryShell } from "@/components/inventory/InventoryShell";

export default function InventoryPage() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <LockProvider>
          <InventoryShell />
        </LockProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
