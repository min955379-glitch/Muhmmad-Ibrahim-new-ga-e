/**
 * 20 Hand-Authored Mart Layouts + Endless Prestige Modifiers (§9)
 */

export type StationType = 'crop' | 'animal' | 'machine' | 'shelf' | 'till' | 'breakroom';

export interface StationBlueprint {
  id: string;
  type: StationType;
  label: string;
  x: number;
  z: number;
  unlockCost: number; // 0 = unlocked from start
  productId?: string;
  machineId?: string;
  animalType?: 'hen' | 'cow';
  feedProductId?: string;
}

export interface MartDef {
  index: number;
  name: string;
  themeLabel: string;
  newVerb: string;
  signatureProp: string;
  floorPrimaryColor: number;
  floorSecondaryColor: number;
  wallColor: number;
  accentColor: number;
  martMultiplier: number;
  star1Revenue: number;
  star2Customers: number;
  star3Seconds: number;
  stations: StationBlueprint[];
}

export interface PrestigeModifier {
  id: string;
  name: string;
  description: string;
  trafficMultiplier: number;
  patienceMultiplier: number;
  maxStaffLimit: number | null;
}

export const PRESTIGE_MODIFIERS: readonly PrestigeModifier[] = [
  {
    id: 'rush_hour',
    name: 'Double Traffic / Half Patience',
    description: '2× customer arrival speed, 0.65× patience window, +25% bonus tips.',
    trafficMultiplier: 2.0,
    patienceMultiplier: 0.65,
    maxStaffLimit: null,
  },
  {
    id: 'lean_crew',
    name: 'Boutique Duo Crew',
    description: 'Maximum 4 active staff on the floor, +40% hero move & carry bonus.',
    trafficMultiplier: 1.25,
    patienceMultiplier: 1.1,
    maxStaffLimit: 4,
  },
  {
    id: 'golden_feast',
    name: 'Golden Basket Festival',
    description: 'Customers buy larger baskets and pay +30% premium.',
    trafficMultiplier: 1.4,
    patienceMultiplier: 0.9,
    maxStaffLimit: null,
  },
];

function buildMartStations(
  index: number,
  cropProducts: string[],
  animalConfigs: Array<{ animalType: 'hen' | 'cow'; productId: string; feedProductId: string }>,
  machineIds: string[],
  shelfProducts: string[],
  hasSecondTill: boolean,
): StationBlueprint[] {
  const stations: StationBlueprint[] = [];
  const costScale = 1 + (index - 1) * 0.28;

  // Crops along West side (x = -6.5 to -4.2)
  cropProducts.forEach((prod, i) => {
    const z = -4.2 + i * 2.8;
    stations.push({
      id: `crop_${prod}_${i + 1}`,
      type: 'crop',
      label: `${prod.replace(/_/g, ' ')} Patch`,
      x: -6.2,
      z,
      unlockCost: i === 0 ? 0 : Math.round(45 * (i + 1) * costScale),
      productId: prod,
    });
  });

  // Animals along North-West (x = -3.2, z = -5.2)
  animalConfigs.forEach((anim, i) => {
    stations.push({
      id: `animal_${anim.animalType}_${i + 1}`,
      type: 'animal',
      label: anim.animalType === 'hen' ? 'Cozy Hen Coop' : 'Dairy Pasture Pad',
      x: -3.2 + i * 2.8,
      z: -5.2,
      unlockCost: Math.round(75 * (i + 1) * costScale),
      animalType: anim.animalType,
      productId: anim.productId,
      feedProductId: anim.feedProductId,
    });
  });

  // Machines along North-East (x = 2.6 to 6.0, z = -4.8 to -1.5)
  machineIds.forEach((mId, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    stations.push({
      id: `machine_${mId}_${i + 1}`,
      type: 'machine',
      label: mId.replace(/_/g, ' '),
      x: 3.4 + col * 2.8,
      z: -4.8 + row * 2.8,
      unlockCost: Math.round(95 * (i + 1) * costScale),
      machineId: mId,
    });
  });

  // Shelves in Center Display Aisles (x = -2.2 to 2.2, z = -1.8 to 2.0)
  shelfProducts.forEach((prod, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    stations.push({
      id: `shelf_${prod}_${i + 1}`,
      type: 'shelf',
      label: `${prod.replace(/_/g, ' ')} Display`,
      x: -1.6 + col * 3.2,
      z: -1.6 + row * 2.5,
      unlockCost: i === 0 ? 0 : Math.round(55 * i * costScale),
      productId: prod,
    });
  });

  // Checkouts near South Entrance (z = 4.5)
  stations.push({
    id: 'till_1',
    type: 'till',
    label: 'Express Register #1',
    x: -2.0,
    z: 4.5,
    unlockCost: 0,
  });

  if (hasSecondTill) {
    stations.push({
      id: 'till_2',
      type: 'till',
      label: 'Express Register #2',
      x: 2.2,
      z: 4.5,
      unlockCost: Math.round(140 * costScale),
    });
  }

  // Staff Break Room in South-East Corner
  stations.push({
    id: 'breakroom_1',
    type: 'breakroom',
    label: 'Crew Lounge & Coffee Bar',
    x: 6.2,
    z: 4.2,
    unlockCost: 0,
  });

  return stations;
}

export const MARTS: readonly MartDef[] = [
  {
    index: 1,
    name: 'Corner Mart',
    themeLabel: 'Warm Wood & Morning Sun',
    newVerb: 'Harvest & Sell',
    signatureProp: 'Rolling Green Awning Door',
    floorPrimaryColor: 0xfff6e9,
    floorSecondaryColor: 0xf4e4ce,
    wallColor: 0xb07c4a,
    accentColor: 0x4fa85c,
    martMultiplier: 1.0,
    star1Revenue: 450,
    star2Customers: 20,
    star3Seconds: 240,
    stations: buildMartStations(
      1,
      ['tomato', 'apple'],
      [{ animalType: 'hen', productId: 'egg', feedProductId: 'tomato' }],
      ['blender'],
      ['tomato', 'apple', 'egg', 'tomato_preserve'],
      false,
    ),
  },
  {
    index: 2,
    name: "Farmers' Market",
    themeLabel: 'Canvas Awnings & Golden Straw',
    newVerb: 'Stock a Mixed Stand',
    signatureProp: 'Hand-Painted Price Boards',
    floorPrimaryColor: 0xf4e4ce,
    floorSecondaryColor: 0xe8d5b7,
    wallColor: 0x4fa85c,
    accentColor: 0xffc65c,
    martMultiplier: 1.12,
    star1Revenue: 750,
    star2Customers: 26,
    star3Seconds: 300,
    stations: buildMartStations(
      2,
      ['tomato', 'cucumber', 'apple'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'cucumber' }],
      ['mill', 'oven'],
      ['tomato', 'cucumber', 'milk', 'bread'],
      false,
    ),
  },
  {
    index: 3,
    name: 'Bakery Mart',
    themeLabel: 'Cream, Wheat & Flour Dust',
    newVerb: 'Feed the Artisan Oven',
    signatureProp: 'Rotating Bread Carousel',
    floorPrimaryColor: 0xfff6e9,
    floorSecondaryColor: 0xf2dfc4,
    wallColor: 0xd89448,
    accentColor: 0xe8503a,
    martMultiplier: 1.24,
    star1Revenue: 1100,
    star2Customers: 30,
    star3Seconds: 340,
    stations: buildMartStations(
      3,
      ['tomato', 'coffee_bean'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'tomato' }],
      ['mill', 'oven', 'churn'],
      ['flour', 'bread', 'cheese', 'tomato'],
      false,
    ),
  },
  {
    index: 4,
    name: 'Dairy Mart',
    themeLabel: 'Cool Alpine Blue & Frosted Glass',
    newVerb: 'Milk & Churn Creamery',
    signatureProp: 'Aged Cheese Wheel Stack',
    floorPrimaryColor: 0xeef7fa,
    floorSecondaryColor: 0xd8ecf2,
    wallColor: 0x2e9e9b,
    accentColor: 0xffc65c,
    martMultiplier: 1.35,
    star1Revenue: 1450,
    star2Customers: 34,
    star3Seconds: 380,
    stations: buildMartStations(
      4,
      ['apple', 'cucumber'],
      [
        { animalType: 'cow', productId: 'milk', feedProductId: 'apple' },
        { animalType: 'hen', productId: 'egg', feedProductId: 'cucumber' },
      ],
      ['churn', 'smoothie_blender'],
      ['milk', 'cheese', 'egg', 'fruit_smoothie'],
      false,
    ),
  },
  {
    index: 5,
    name: 'Pizza Mart',
    themeLabel: 'Terracotta & Wood-Fired Orange',
    newVerb: 'Build Multi-Input Pizzas',
    signatureProp: 'Brick Wood-Fired Dome',
    floorPrimaryColor: 0xfff2e6,
    floorSecondaryColor: 0xf5d6be,
    wallColor: 0xe8503a,
    accentColor: 0xf2b33d,
    martMultiplier: 1.48,
    star1Revenue: 1900,
    star2Customers: 38,
    star3Seconds: 420,
    stations: buildMartStations(
      5,
      ['tomato', 'coffee_bean'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'tomato' }],
      ['mill', 'oven', 'coffee_machine'],
      ['tomato', 'bread', 'coffee', 'cheese'],
      true,
    ),
  },
  {
    index: 6,
    name: 'Cafe Mart',
    themeLabel: 'Walnut, Brass & Warm Pendant Lamps',
    newVerb: 'Latte Art & Espresso Bar',
    signatureProp: 'Chalkboard Menu & Steam Bar',
    floorPrimaryColor: 0xf5ebe1,
    floorSecondaryColor: 0xe3d1be,
    wallColor: 0x5c3a21,
    accentColor: 0x2e9e9b,
    martMultiplier: 1.62,
    star1Revenue: 2400,
    star2Customers: 42,
    star3Seconds: 450,
    stations: buildMartStations(
      6,
      ['coffee_bean', 'apple'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'apple' }],
      ['coffee_machine', 'espresso_machine', 'oven'],
      ['coffee', 'latte', 'bread', 'apple'],
      true,
    ),
  },
  {
    index: 7,
    name: 'Burger Mart',
    themeLabel: 'Diner Chrome & Ketchup Red',
    newVerb: 'Sizzle Griddle & Fry Station',
    signatureProp: 'Glowing Neon OPEN Sign',
    floorPrimaryColor: 0xfff6e9,
    floorSecondaryColor: 0xdfe5eb,
    wallColor: 0xe8503a,
    accentColor: 0x2e9e9b,
    martMultiplier: 1.78,
    star1Revenue: 2900,
    star2Customers: 46,
    star3Seconds: 480,
    stations: buildMartStations(
      7,
      ['tomato', 'cucumber'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'tomato' }],
      ['mill', 'fryer', 'griddle'],
      ['fries', 'burger', 'milk', 'tomato'],
      true,
    ),
  },
  {
    index: 8,
    name: 'Sushi Mart',
    themeLabel: 'Pale Hinoki Cedar & Indigo Noren',
    newVerb: 'Precision Sushi Roller',
    signatureProp: 'Kaiten Conveyor Display',
    floorPrimaryColor: 0xf7f3eb,
    floorSecondaryColor: 0xe5dec9,
    wallColor: 0x23324a,
    accentColor: 0xff8b6b,
    martMultiplier: 1.95,
    star1Revenue: 3500,
    star2Customers: 50,
    star3Seconds: 500,
    stations: buildMartStations(
      8,
      ['cucumber', 'apple'],
      [{ animalType: 'hen', productId: 'egg', feedProductId: 'cucumber' }],
      ['sushi_roller', 'steamer'],
      ['sushi_roll', 'dumplings', 'cucumber', 'egg'],
      true,
    ),
  },
  {
    index: 9,
    name: 'Noodle House',
    themeLabel: 'Lantern Glow & Bamboo Steam',
    newVerb: 'Broth Boil & Steamer Stack',
    signatureProp: 'Tiered Bamboo Steamers',
    floorPrimaryColor: 0xf9efe4,
    floorSecondaryColor: 0xe8d5c1,
    wallColor: 0xc93b2b,
    accentColor: 0xf2b33d,
    martMultiplier: 2.1,
    star1Revenue: 4100,
    star2Customers: 54,
    star3Seconds: 520,
    stations: buildMartStations(
      9,
      ['tomato', 'cucumber'],
      [{ animalType: 'hen', productId: 'egg', feedProductId: 'tomato' }],
      ['mill', 'noodle_boiler', 'steamer'],
      ['ramen_bowl', 'dumplings', 'egg', 'flour'],
      true,
    ),
  },
  {
    index: 10,
    name: 'Juice Bar',
    themeLabel: 'Tropical Citrus & Fresh Mint',
    newVerb: 'Dual-Fruit Smoothie Blend',
    signatureProp: 'Sunlit Fruit Pyramid Display',
    floorPrimaryColor: 0xf2fcf6,
    floorSecondaryColor: 0xd9f5e5,
    wallColor: 0x2e9e9b,
    accentColor: 0xff8b6b,
    martMultiplier: 2.28,
    star1Revenue: 4800,
    star2Customers: 58,
    star3Seconds: 540,
    stations: buildMartStations(
      10,
      ['apple', 'tomato', 'coffee_bean'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'apple' }],
      ['smoothie_blender', 'bubble_tea_sealer'],
      ['fruit_smoothie', 'bubble_tea', 'apple', 'milk'],
      true,
    ),
  },
  {
    index: 11,
    name: 'Donut Mart',
    themeLabel: 'Strawberry Glaze & Rainbow Sprinkles',
    newVerb: 'Glaze & Pastry Ring Line',
    signatureProp: 'Rotating Giant Donut Wall',
    floorPrimaryColor: 0xfff2f5,
    floorSecondaryColor: 0xfce0e8,
    wallColor: 0xff8b6b,
    accentColor: 0x8e5bc9,
    martMultiplier: 2.45,
    star1Revenue: 5500,
    star2Customers: 62,
    star3Seconds: 560,
    stations: buildMartStations(
      11,
      ['coffee_bean', 'apple'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'apple' }],
      ['mill', 'cake_oven', 'espresso_machine'],
      ['cake_slice', 'latte', 'coffee_bean', 'milk'],
      true,
    ),
  },
  {
    index: 12,
    name: 'Ice Cream Parlour',
    themeLabel: 'Pastel Mint & Candy Stripes',
    newVerb: 'Sub-Zero Churn & Freezer',
    signatureProp: 'Frosted Walk-In Gelato Case',
    floorPrimaryColor: 0xf4fbf9,
    floorSecondaryColor: 0xdcf2ec,
    wallColor: 0x2e9e9b,
    accentColor: 0xff8b6b,
    martMultiplier: 2.65,
    star1Revenue: 6300,
    star2Customers: 65,
    star3Seconds: 580,
    stations: buildMartStations(
      12,
      ['apple', 'tomato'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'apple' }],
      ['ice_cream_churn', 'freezer'],
      ['ice_cream_cone', 'popsicle', 'milk', 'apple'],
      true,
    ),
  },
  {
    index: 13,
    name: 'Taco Mart',
    themeLabel: 'Sunset Cantina & Papel Picado',
    newVerb: 'Char-Grill & Salsa Prep',
    signatureProp: 'Al Pastor Rotating Trompo',
    floorPrimaryColor: 0xfff5e8,
    floorSecondaryColor: 0xf5dec2,
    wallColor: 0xe8503a,
    accentColor: 0x4fa85c,
    martMultiplier: 2.85,
    star1Revenue: 7200,
    star2Customers: 68,
    star3Seconds: 600,
    stations: buildMartStations(
      13,
      ['tomato', 'cucumber'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'tomato' }],
      ['churn', 'grill', 'blender'],
      ['taco', 'cheese', 'tomato_preserve', 'cucumber'],
      true,
    ),
  },
  {
    index: 14,
    name: 'Cake Boutique',
    themeLabel: 'Patisserie Blush & Brushed Gold',
    newVerb: 'Multi-Stage Cake Decorating',
    signatureProp: 'Illuminated Glass Cake Dome',
    floorPrimaryColor: 0xfff8f6,
    floorSecondaryColor: 0xf7e6e1,
    wallColor: 0x8e5bc9,
    accentColor: 0xf2b33d,
    martMultiplier: 3.1,
    star1Revenue: 8200,
    star2Customers: 72,
    star3Seconds: 620,
    stations: buildMartStations(
      14,
      ['apple', 'coffee_bean'],
      [
        { animalType: 'hen', productId: 'egg', feedProductId: 'apple' },
        { animalType: 'cow', productId: 'milk', feedProductId: 'coffee_bean' },
      ],
      ['mill', 'cake_oven', 'decorating_station'],
      ['cake_slice', 'whole_cake', 'egg', 'milk'],
      true,
    ),
  },
  {
    index: 15,
    name: 'Pet Mart',
    themeLabel: 'Meadow Lime & Sky Pavilion',
    newVerb: 'Animal Welfare & Kibble Line',
    signatureProp: 'Panoramic Coral Aquarium Wall',
    floorPrimaryColor: 0xf4fcf2,
    floorSecondaryColor: 0xddf2d8,
    wallColor: 0x4fa85c,
    accentColor: 0x2e9e9b,
    martMultiplier: 3.35,
    star1Revenue: 9400,
    star2Customers: 75,
    star3Seconds: 640,
    stations: buildMartStations(
      15,
      ['tomato', 'cucumber'],
      [
        { animalType: 'hen', productId: 'egg', feedProductId: 'tomato' },
        { animalType: 'cow', productId: 'milk', feedProductId: 'cucumber' },
      ],
      ['mill', 'kibble_dispenser'],
      ['pet_kibble', 'egg', 'milk', 'tomato'],
      true,
    ),
  },
  {
    index: 16,
    name: 'Pharmacy & Wellness Mart',
    themeLabel: 'Botanical White & Mint Apothecary',
    newVerb: 'Botanical Extract & Vitamin Pack',
    signatureProp: 'Apothecary Cross & Herb Wall',
    floorPrimaryColor: 0xf7fcfb,
    floorSecondaryColor: 0xe3f2ef,
    wallColor: 0x1c5f63,
    accentColor: 0xa8e6c1,
    martMultiplier: 3.6,
    star1Revenue: 10800,
    star2Customers: 78,
    star3Seconds: 660,
    stations: buildMartStations(
      16,
      ['potted_herb', 'apple'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'apple' }],
      ['smoothie_blender', 'florist_wrapping_station'],
      ['potted_herb', 'bouquet', 'fruit_smoothie', 'apple'],
      true,
    ),
  },
  {
    index: 17,
    name: 'Tech & Gadget Mart',
    themeLabel: 'Brushed Aluminium & Cyber Teal',
    newVerb: 'Cleanroom Assembly & QA Bench',
    signatureProp: 'Humming Server Tower & Holo Pedestal',
    floorPrimaryColor: 0xf0f4f8,
    floorSecondaryColor: 0xdce4ec,
    wallColor: 0x23324a,
    accentColor: 0x2e9e9b,
    martMultiplier: 3.9,
    star1Revenue: 12500,
    star2Customers: 82,
    star3Seconds: 680,
    stations: buildMartStations(
      17,
      ['apple', 'coffee_bean'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'apple' }],
      ['electronics_assembler', 'espresso_machine'],
      ['earbuds', 'latte', 'apple', 'coffee_bean'],
      true,
    ),
  },
  {
    index: 18,
    name: 'Florist & Botanical Mart',
    themeLabel: 'Lavender Conservatory & Sage Glass',
    newVerb: 'Ribbon Bouquet Wrapping',
    signatureProp: 'Misted Orchid Greenhouse Arch',
    floorPrimaryColor: 0xfaf5ff,
    floorSecondaryColor: 0xede2f7,
    wallColor: 0x8e5bc9,
    accentColor: 0x4fa85c,
    martMultiplier: 4.2,
    star1Revenue: 14200,
    star2Customers: 86,
    star3Seconds: 700,
    stations: buildMartStations(
      18,
      ['potted_herb', 'tomato'],
      [{ animalType: 'hen', productId: 'egg', feedProductId: 'tomato' }],
      ['florist_wrapping_station', 'blender'],
      ['potted_herb', 'bouquet', 'tomato_preserve', 'egg'],
      true,
    ),
  },
  {
    index: 19,
    name: 'Cinema Snack Bar',
    themeLabel: 'Velvet Plum & Marquee Gold',
    newVerb: 'Showtime Rush Hour Bursts',
    signatureProp: 'Golden Kettle Popcorn Popper',
    floorPrimaryColor: 0xfbf4f8,
    floorSecondaryColor: 0xeddce6,
    wallColor: 0x8e5bc9,
    accentColor: 0xf2b33d,
    martMultiplier: 4.6,
    star1Revenue: 16500,
    star2Customers: 90,
    star3Seconds: 720,
    stations: buildMartStations(
      19,
      ['tomato', 'coffee_bean'],
      [{ animalType: 'cow', productId: 'milk', feedProductId: 'tomato' }],
      ['mill', 'fryer', 'bubble_tea_sealer'],
      ['fries', 'bubble_tea', 'milk', 'tomato'],
      true,
    ),
  },
  {
    index: 20,
    name: 'Mega Emporium Flagship',
    themeLabel: 'Grand Toy-Diorama Atrium & Gold Skylight',
    newVerb: 'Full Storefront Orchestration',
    signatureProp: 'Twin Atrium Escalator & Golden Fountain',
    floorPrimaryColor: 0xfff8eb,
    floorSecondaryColor: 0xf4e4ce,
    wallColor: 0x23324a,
    accentColor: 0xf2b33d,
    martMultiplier: 5.2,
    star1Revenue: 20000,
    star2Customers: 100,
    star3Seconds: 780,
    stations: buildMartStations(
      20,
      ['tomato', 'apple', 'potted_herb'],
      [
        { animalType: 'hen', productId: 'egg', feedProductId: 'tomato' },
        { animalType: 'cow', productId: 'milk', feedProductId: 'apple' },
      ],
      ['mill', 'cake_oven', 'decorating_station', 'packing_station'],
      ['cake_slice', 'whole_cake', 'signature_mart_box', 'potted_herb'],
      true,
    ),
  },
];

export function getMartDef(martIndex: number): MartDef {
  const clamped = Math.max(1, Math.min(MARTS.length, martIndex));
  return MARTS[clamped - 1]!;
}
