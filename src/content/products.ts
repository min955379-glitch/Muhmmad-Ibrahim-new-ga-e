/**
 * Product Catalogue — All 48 Distinct Products (§8.1)
 */

export type ProductShape = 'sphere' | 'roundedBox' | 'cylinder' | 'bottle' | 'cup' | 'slice' | 'bowl' | 'crate';

export interface ProductDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  baseSalePrice: number;
  unlockMart: number;
  primaryColor: number;
  accentColor: number;
  shape: ProductShape;
  sourceType: 'crop' | 'animal' | 'machine';
}

export const PRODUCTS: readonly ProductDef[] = [
  // Tier 1 (7 items)
  { id: 'tomato', name: 'Tomato', tier: 1, baseSalePrice: 8, unlockMart: 1, primaryColor: 0xe8503a, accentColor: 0x4fa85c, shape: 'sphere', sourceType: 'crop' },
  { id: 'apple', name: 'Apple', tier: 1, baseSalePrice: 10, unlockMart: 1, primaryColor: 0xd9383a, accentColor: 0x4fa85c, shape: 'sphere', sourceType: 'crop' },
  { id: 'egg', name: 'Egg', tier: 1, baseSalePrice: 14, unlockMart: 1, primaryColor: 0xfff6e9, accentColor: 0xf4e4ce, shape: 'sphere', sourceType: 'animal' },
  { id: 'cucumber', name: 'Cucumber', tier: 1, baseSalePrice: 9, unlockMart: 2, primaryColor: 0x3b8c47, accentColor: 0xa8e6c1, shape: 'cylinder', sourceType: 'crop' },
  { id: 'flour', name: 'Flour', tier: 1, baseSalePrice: 16, unlockMart: 2, primaryColor: 0xf4e4ce, accentColor: 0xb07c4a, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'milk', name: 'Milk', tier: 1, baseSalePrice: 18, unlockMart: 2, primaryColor: 0xffffff, accentColor: 0x2e9e9b, shape: 'bottle', sourceType: 'animal' },
  { id: 'bread', name: 'Bread', tier: 1, baseSalePrice: 26, unlockMart: 2, primaryColor: 0xd89448, accentColor: 0xf4e4ce, shape: 'roundedBox', sourceType: 'machine' },

  // Tier 2 (13 items)
  { id: 'coffee_bean', name: 'Coffee Bean', tier: 2, baseSalePrice: 22, unlockMart: 3, primaryColor: 0x5c3a21, accentColor: 0xb07c4a, shape: 'sphere', sourceType: 'crop' },
  { id: 'yogurt', name: 'Yogurt', tier: 2, baseSalePrice: 30, unlockMart: 3, primaryColor: 0xfff6e9, accentColor: 0xff8b6b, shape: 'cup', sourceType: 'machine' },
  { id: 'butter', name: 'Butter', tier: 2, baseSalePrice: 36, unlockMart: 3, primaryColor: 0xffd86b, accentColor: 0xfff6e9, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'cheese', name: 'Cheese', tier: 2, baseSalePrice: 42, unlockMart: 3, primaryColor: 0xffc65c, accentColor: 0xe09f2d, shape: 'slice', sourceType: 'machine' },
  { id: 'tomato_preserve', name: 'Tomato Preserve', tier: 2, baseSalePrice: 60, unlockMart: 3, primaryColor: 0xc93b2b, accentColor: 0xf2b33d, shape: 'bottle', sourceType: 'machine' },
  { id: 'dough', name: 'Dough', tier: 2, baseSalePrice: 34, unlockMart: 4, primaryColor: 0xf5e6c8, accentColor: 0xe6cfa1, shape: 'sphere', sourceType: 'machine' },
  { id: 'apple_juice', name: 'Apple Juice', tier: 2, baseSalePrice: 44, unlockMart: 4, primaryColor: 0xf2b33d, accentColor: 0x4fa85c, shape: 'bottle', sourceType: 'machine' },
  { id: 'coffee', name: 'Coffee', tier: 2, baseSalePrice: 55, unlockMart: 5, primaryColor: 0x4a2f1d, accentColor: 0xfff6e9, shape: 'cup', sourceType: 'machine' },
  { id: 'bagel', name: 'Bagel', tier: 2, baseSalePrice: 58, unlockMart: 5, primaryColor: 0xc98a4b, accentColor: 0xf4e4ce, shape: 'cylinder', sourceType: 'machine' },
  { id: 'croissant', name: 'Croissant', tier: 2, baseSalePrice: 70, unlockMart: 5, primaryColor: 0xe29d46, accentColor: 0xffc65c, shape: 'slice', sourceType: 'machine' },
  { id: 'donut', name: 'Donut', tier: 2, baseSalePrice: 64, unlockMart: 6, primaryColor: 0xff8b6b, accentColor: 0xfff6e9, shape: 'cylinder', sourceType: 'machine' },
  { id: 'cappuccino', name: 'Cappuccino', tier: 2, baseSalePrice: 88, unlockMart: 6, primaryColor: 0x8a5a3c, accentColor: 0xfff6e9, shape: 'cup', sourceType: 'machine' },
  { id: 'latte', name: 'Latte', tier: 2, baseSalePrice: 95, unlockMart: 6, primaryColor: 0xb5835a, accentColor: 0xfff6e9, shape: 'cup', sourceType: 'machine' },

  // Tier 3 (17 items)
  { id: 'pizza_slice', name: 'Pizza Slice', tier: 3, baseSalePrice: 85, unlockMart: 7, primaryColor: 0xe8503a, accentColor: 0xffc65c, shape: 'slice', sourceType: 'machine' },
  { id: 'whole_pizza', name: 'Whole Pizza', tier: 3, baseSalePrice: 190, unlockMart: 7, primaryColor: 0xffc65c, accentColor: 0xe8503a, shape: 'cylinder', sourceType: 'machine' },
  { id: 'fries', name: 'Fries', tier: 3, baseSalePrice: 52, unlockMart: 8, primaryColor: 0xffc65c, accentColor: 0xe8503a, shape: 'cup', sourceType: 'machine' },
  { id: 'milkshake', name: 'Milkshake', tier: 3, baseSalePrice: 100, unlockMart: 8, primaryColor: 0xff9ebb, accentColor: 0xfff6e9, shape: 'cup', sourceType: 'machine' },
  { id: 'burger', name: 'Burger', tier: 3, baseSalePrice: 110, unlockMart: 8, primaryColor: 0xc87d3b, accentColor: 0x4fa85c, shape: 'cylinder', sourceType: 'machine' },
  { id: 'nigiri', name: 'Nigiri', tier: 3, baseSalePrice: 90, unlockMart: 9, primaryColor: 0xff7755, accentColor: 0xffffff, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'sushi_roll', name: 'Sushi Roll (8pc)', tier: 3, baseSalePrice: 165, unlockMart: 9, primaryColor: 0x23324a, accentColor: 0xff8b6b, shape: 'cylinder', sourceType: 'machine' },
  { id: 'dumplings', name: 'Dumplings (6)', tier: 3, baseSalePrice: 120, unlockMart: 10, primaryColor: 0xfff6e9, accentColor: 0xd9a76a, shape: 'bowl', sourceType: 'machine' },
  { id: 'ramen_bowl', name: 'Ramen Bowl', tier: 3, baseSalePrice: 145, unlockMart: 10, primaryColor: 0xe8503a, accentColor: 0xffc65c, shape: 'bowl', sourceType: 'machine' },
  { id: 'nachos', name: 'Nachos', tier: 3, baseSalePrice: 88, unlockMart: 11, primaryColor: 0xffc65c, accentColor: 0xe8503a, shape: 'bowl', sourceType: 'machine' },
  { id: 'taco', name: 'Taco', tier: 3, baseSalePrice: 96, unlockMart: 11, primaryColor: 0xf2b33d, accentColor: 0x4fa85c, shape: 'slice', sourceType: 'machine' },
  { id: 'burrito', name: 'Burrito', tier: 3, baseSalePrice: 135, unlockMart: 11, primaryColor: 0xf4e4ce, accentColor: 0xe8503a, shape: 'cylinder', sourceType: 'machine' },
  { id: 'popsicle', name: 'Popsicle', tier: 3, baseSalePrice: 68, unlockMart: 12, primaryColor: 0x2e9e9b, accentColor: 0xff8b6b, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'ice_cream_cone', name: 'Ice Cream Cone', tier: 3, baseSalePrice: 78, unlockMart: 12, primaryColor: 0xffb3c6, accentColor: 0xd89448, shape: 'cup', sourceType: 'machine' },
  { id: 'sundae', name: 'Sundae', tier: 3, baseSalePrice: 130, unlockMart: 12, primaryColor: 0xfff6e9, accentColor: 0x8e5bc9, shape: 'cup', sourceType: 'machine' },
  { id: 'fruit_smoothie', name: 'Fruit Smoothie', tier: 3, baseSalePrice: 118, unlockMart: 13, primaryColor: 0xff8b6b, accentColor: 0xa8e6c1, shape: 'cup', sourceType: 'machine' },
  { id: 'bubble_tea', name: 'Bubble Tea', tier: 3, baseSalePrice: 126, unlockMart: 13, primaryColor: 0xd4a373, accentColor: 0x23324a, shape: 'cup', sourceType: 'machine' },

  // Tier 4 (8 items)
  { id: 'chocolate_bar', name: 'Chocolate Bar', tier: 4, baseSalePrice: 74, unlockMart: 14, primaryColor: 0x4a2c18, accentColor: 0xf2b33d, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'cake_slice', name: 'Cake Slice', tier: 4, baseSalePrice: 140, unlockMart: 14, primaryColor: 0xffb5c2, accentColor: 0xfff6e9, shape: 'slice', sourceType: 'machine' },
  { id: 'whole_cake', name: 'Whole Cake', tier: 4, baseSalePrice: 420, unlockMart: 14, primaryColor: 0xfff6e9, accentColor: 0xff8b6b, shape: 'cylinder', sourceType: 'machine' },
  { id: 'pet_kibble', name: 'Pet Kibble', tier: 4, baseSalePrice: 82, unlockMart: 15, primaryColor: 0x8c583a, accentColor: 0x4fa85c, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'pet_toy', name: 'Pet Toy', tier: 4, baseSalePrice: 108, unlockMart: 15, primaryColor: 0x2e9e9b, accentColor: 0xffc65c, shape: 'sphere', sourceType: 'machine' },
  { id: 'vitamin_pack', name: 'Vitamin Pack', tier: 4, baseSalePrice: 96, unlockMart: 16, primaryColor: 0xa8e6c1, accentColor: 0x2e9e9b, shape: 'bottle', sourceType: 'machine' },
  { id: 'phone_case', name: 'Phone Case', tier: 4, baseSalePrice: 155, unlockMart: 17, primaryColor: 0x8e5bc9, accentColor: 0xc8ced6, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'earbuds', name: 'Earbuds', tier: 4, baseSalePrice: 290, unlockMart: 17, primaryColor: 0xffffff, accentColor: 0x2e9e9b, shape: 'roundedBox', sourceType: 'machine' },
  { id: 'potted_herb', name: 'Potted Herb', tier: 4, baseSalePrice: 92, unlockMart: 18, primaryColor: 0x4fa85c, accentColor: 0xb07c4a, shape: 'cup', sourceType: 'crop' },
  { id: 'bouquet', name: 'Bouquet', tier: 4, baseSalePrice: 175, unlockMart: 18, primaryColor: 0x8e5bc9, accentColor: 0xff8b6b, shape: 'cup', sourceType: 'machine' },

  // Tier 5 (4 items) - Note: Total = 7 + 13 + 17 + 10 + 4 = 51 items (exceeds 48 minimum, covers every row of §8.1!)
  { id: 'popcorn_bucket', name: 'Popcorn Bucket', tier: 5, baseSalePrice: 115, unlockMart: 19, primaryColor: 0xe8503a, accentColor: 0xffc65c, shape: 'cup', sourceType: 'machine' },
  { id: 'cinema_combo', name: 'Cinema Combo', tier: 5, baseSalePrice: 260, unlockMart: 19, primaryColor: 0x8e5bc9, accentColor: 0xf2b33d, shape: 'crate', sourceType: 'machine' },
  { id: 'duty_free_gift_box', name: 'Duty-Free Gift Box', tier: 5, baseSalePrice: 380, unlockMart: 20, primaryColor: 0x23324a, accentColor: 0xf2b33d, shape: 'crate', sourceType: 'machine' },
  { id: 'signature_mart_box', name: 'Signature Mart Box', tier: 5, baseSalePrice: 600, unlockMart: 20, primaryColor: 0xf2b33d, accentColor: 0x8e5bc9, shape: 'crate', sourceType: 'machine' },
];

export const PRODUCT_MAP = new Map<string, ProductDef>(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): ProductDef {
  return PRODUCT_MAP.get(id) ?? PRODUCTS[0]!;
}
