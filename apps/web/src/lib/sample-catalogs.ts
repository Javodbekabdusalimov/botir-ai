import type { BusinessCategory, CatalogRowInput } from "./types";
import { SAMPLE_CATALOG } from "./mock";

/** "Namuna katalog" tugmasi: tanlangan kategoriyaga mos namuna (oshxona namunasi avtoservisga tushmasin). */
const BY_CATEGORY: Partial<Record<BusinessCategory, CatalogRowInput[]>> = {
  restaurant: SAMPLE_CATALOG,
  autoservice: [
    { name: "Moy almashtirish (ish haqi)", price: 50000, unit: "xizmat" },
    { name: "Kompyuter diagnostika", price: 100000, unit: "xizmat" },
    { name: "Razval-shoxojdenie", price: 120000, unit: "xizmat" },
    { name: "Balansirovka", price: 20000, unit: "g'ildirak" },
    { name: "Tormoz kolodkasi almashtirish", price: 80000, unit: "xizmat" },
  ],
  shop: [
    { name: "Non", price: 4000, unit: "dona" },
    { name: "Sut 1 l", price: 13000, unit: "dona" },
    { name: "Tuxum", price: 18000, unit: "10 dona" },
  ],
  clinic: [
    { name: "Shifokor ko'rigi", price: 150000, unit: "xizmat" },
    { name: "Umumiy qon tahlili", price: 60000, unit: "xizmat" },
  ],
  beauty: [
    { name: "Soch olish", price: 80000, unit: "xizmat" },
    { name: "Manikyur", price: 120000, unit: "xizmat" },
  ],
};

export const sampleCatalog = (c: BusinessCategory): CatalogRowInput[] => BY_CATEGORY[c] ?? SAMPLE_CATALOG;
