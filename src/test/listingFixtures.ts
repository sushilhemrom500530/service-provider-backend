/**
 * Listings written straight to the in-memory DB (no upload) for booking tests.
 */
import { SkiPass } from '../modules/skiPass/skipass.model';
import { SkiHire } from '../modules/skiHire/skihire.model';
import { Transport } from '../modules/transport/transport.model';
import { Restaurant } from '../modules/restaurant/restaurant.model';
import { Massage } from '../modules/massage/massage.model';
import { makeSubCategory } from './factories';

const IMG = 'https://test/img.png';

export const makeSkiPassListing = async (ownerId: string, amount = 50) =>
  (SkiPass as any).create({
    title: 'Day pass',
    description: 'All lifts',
    thumbnail: IMG,
    owner: ownerId,
    skiPassType: 'Basic',
    services: [{ title: 'Lifts', description: 'All lifts' }],
    serviceArea: 'Val Thorens',
    amount,
  });

export const makeSkiHireListing = async (ownerId: string, opts: { qty?: number; price?: number; rate?: number } = {}) =>
  (SkiHire as any).create({
    category: await makeSubCategory('Ski_Hire'),
    title: 'Ski rental',
    thumbnail: IMG,
    owner: ownerId,
    serviceArea: 'Val Thorens',
    priceUnit: 'per_day',
    extraChargePerHour: opts.rate ?? 10,
    items: [
      { productName: 'Skis', productPhoto: IMG, price: opts.price ?? 25, totalQty: opts.qty ?? 2, availableQty: opts.qty ?? 2 },
      { productName: 'Boots', productPhoto: IMG, price: 10, totalQty: 5, availableQty: 5 },
    ],
  });

export const makeTransportListing = async (ownerId: string, amount = 100) =>
  (Transport as any).create({
    owner: ownerId,
    category: await makeSubCategory('Transport'),
    thumbnail: IMG,
    title: 'Airport shuttle',
    personCount: 4,
    milage: '10 km/l',
    power: '150hp',
    extraChargePerHours: 20,
    insuranceFee: 0,
    maintainCharge: 0,
    serviceArea: 'Geneva',
    amount,
    description: 'Van',
  });

export const makeRestaurantListing = async (ownerId: string) =>
  (Restaurant as any).create({
    title: 'Chalet bistro',
    thumbnail: IMG,
    category: await makeSubCategory('Restaurant'),
    owner: ownerId,
    openTime: '10:00 AM',
    closeTime: '11:00 PM',
    serviceArea: 'Val Thorens',
    serviceFee: 5,
    foodType: 'French',
    items: [
      { seat: 'VIP', photo: IMG, totalQty: 2, availableQty: 2, price: 40, description: 'VIP' },
      { seat: 'Normal', photo: IMG, totalQty: 10, availableQty: 10, price: 20, description: 'Normal' },
    ],
    slots: [
      { startTime: '12:00 PM', endTime: '2:00 PM' },
      { startTime: '7:00 PM', endTime: '9:00 PM' },
    ],
  });

export const makeMassageListing = async (ownerId: string) =>
  (Massage as any).create({
    category: await makeSubCategory('Massage'),
    owner: ownerId,
    thumbnail: IMG,
    title: 'Deep tissue',
    openTime: '9:00 AM',
    closeTime: '8:00 PM',
    priceByDuration: [
      { duration: '60 min', amount: 80 },
      { duration: '90 min', amount: 110 },
    ],
    serviceArea: 'Val Thorens',
    amount: 80,
    benefits: 'Relax',
    ourRecommendations: 'Drink water',
  });
