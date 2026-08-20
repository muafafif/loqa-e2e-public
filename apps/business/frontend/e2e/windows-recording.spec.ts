import { expect, test } from "@playwright/test";

test.describe("LOQA Work Windows recording path", () => {
  test("walks seeded business modules", async ({ page }) => {
    await page.goto("/finance");
    await expect(page.getByText("Finance").first()).toBeVisible();
    await page.getByTestId("finance-tab-transactions").click();
    await expect(page.getByText(/transactions/i).first()).toBeVisible();
    await page.waitForTimeout(1_000);

    await page.goto("/inventory");
    await expect(page.getByText(/inventory|inventaris/i).first()).toBeVisible();
    await page.getByTestId("inventory-tab-products").click();
    await expect(page.getByText(/product|produk/i).first()).toBeVisible();
    await page.waitForTimeout(1_000);

    await page.goto("/order");
    await expect(page.getByText(/order|kasir/i).first()).toBeVisible();
    await page.getByTestId("order-tab-history").click();
    await expect(page.getByText(/history|riwayat/i).first()).toBeVisible();
    await page.waitForTimeout(1_000);
  });
});
