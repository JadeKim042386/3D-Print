export interface FurnitureProduct {
  id: string;
  nameKo: string;
  nameEn: string;
  category: "bed" | "sofa" | "desk" | "table" | "chair" | "storage";
  widthCm: number;
  depthCm: number;
  heightCm: number;
  priceKrw: number;
  imageUrl?: string;
  affiliateUrl?: string;
}
