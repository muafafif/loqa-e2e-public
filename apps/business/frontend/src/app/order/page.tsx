"use client";

import { I18nProvider } from "@/lib/i18n";
import { LockProvider } from "@/lib/LockContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { OrderShell } from "@/components/order/OrderShell";

export default function OrderPage() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <LockProvider>
          <OrderShell />
        </LockProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
