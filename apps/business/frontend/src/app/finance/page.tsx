"use client";

import { I18nProvider } from "@/lib/i18n";
import { LockProvider } from "@/lib/LockContext";
import { ThemeProvider } from "@/lib/ThemeContext";
import { FinanceShell } from "@/components/finance/FinanceShell";

export default function FinancePage() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <LockProvider>
          <FinanceShell />
        </LockProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
