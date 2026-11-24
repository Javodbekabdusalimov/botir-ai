/** Demo bizneslar uchun rasmlar (public/photos, manba: CREDITS.md). */
const MAP: Record<string, string> = {
  chorsu: "/photos/plov.jpg",
  besh: "/photos/plov.jpg",
  samarqand: "/photos/plov.jpg",
  chilonzor: "/photos/garage.jpg",
  malika: "/photos/shop.jpg",
  "biz-osh": "/photos/plov.jpg",
  "biz-auto": "/photos/garage.jpg",
  "biz-shop": "/photos/shop.jpg",
};
export const bizPhoto = (id: string): string => MAP[id] ?? "/photos/shop.jpg";
