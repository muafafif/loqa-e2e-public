"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { useT } from "@/lib/i18n";
import { BrandsPanel } from "./BrandsPanel";
import { CategoriesPanel } from "./CategoriesPanel";
import { SubcategoriesPanel } from "./SubcategoriesPanel";
import { WarehousesPanel } from "./WarehousesPanel";
import { ProductCategoriesPanel } from "./ProductCategoriesPanel";
import { Tag, Layers, FolderOpen, Warehouse, Grid3X3 } from "lucide-react";

type SubTab = "brands" | "categories" | "subcategories" | "warehouses" | "product_categories";

export function MasterDataPanel() {
  const t = useT();
  const [tab, setTab] = useState<SubTab>("categories");

  const tabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "categories",        label: t("inventory.masterData.tabs.categories"),        icon: <Layers size={13} /> },
    { id: "subcategories",     label: t("inventory.masterData.tabs.subcategories"),     icon: <FolderOpen size={13} /> },
    { id: "brands",            label: t("inventory.masterData.tabs.brands"),            icon: <Tag size={13} /> },
    { id: "warehouses",        label: t("inventory.masterData.tabs.warehouses"),        icon: <Warehouse size={13} /> },
    { id: "product_categories", label: t("inventory.masterData.tabs.productCategories"), icon: <Grid3X3 size={13} /> },
  ];

  return (
    <div className="flex flex-col flex-1">
      {/* Sub-tab bar */}
      <div className="flex items-center border-b th-border th-bg-elevated shrink-0 px-2 gap-1 overflow-x-auto">
        {tabs.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "flex items-center gap-1.5 px-3 py-2.5 text-xs border-b-2 transition-colors whitespace-nowrap shrink-0",
              tab === id
                ? "border-brand-500 th-text"
                : "border-transparent th-text-muted hover:th-text"
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "brands"             && <BrandsPanel />}
        {tab === "categories"         && <CategoriesPanel />}
        {tab === "subcategories"      && <SubcategoriesPanel />}
        {tab === "warehouses"         && <WarehousesPanel />}
        {tab === "product_categories" && <ProductCategoriesPanel />}
      </div>
    </div>
  );
}
