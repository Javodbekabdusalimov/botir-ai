/** Demo bizneslar uchun rasmlar (public/photos, manba: CREDITS.md). */
const MAP: Record<string, string> = {
  chorsu: "/photos/plov.jpg",
  besh: "/photos/plov.jpg",
  samarqand: "/photos/plov.jpg",
  chilonzor: "/photos/garage.jpg",
  malika: "/photos/shop.jpg",
};
export const bizPhoto = (id: string): string => MAP[id] ?? "/photos/shop.jpg";
