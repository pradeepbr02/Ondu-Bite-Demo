// The current storefront. collection.ts remains the immutable input to the v1 migration.
export const currentCollection = [
  {
    slug: 'ready-to-eat',
    name: 'Ready to eat',
    kannadaName: 'ಮನೆಯ ರುಚಿ',
    products: [
      { name: 'Upma', slug: 'upma', kannadaName: 'ಉಪ್ಪಿಟ್ಟು' },
      { name: 'Poha', slug: 'poha', kannadaName: 'ಅವಲಕ್ಕಿ' },
      { name: 'Pongal', slug: 'pongal', kannadaName: 'ಪೊಂಗಲ್' },
      { name: 'Bisibele Bath', slug: 'bisibele-bath', kannadaName: 'ಬಿಸಿಬೇಳೆ ಬಾತ್' },
    ],
  },
  {
    slug: 'ready-to-mix',
    name: 'Ready to mix',
    kannadaName: 'ಸುಲಭ ತಯಾರಿ',
    products: [
      { name: 'Rava Idli Mix', slug: 'rava-idli-mix', kannadaName: 'ರವೆ ಇಡ್ಲಿ ಮಿಶ್ರಣ' },
      { name: 'Gulab Jamun Mix', slug: 'gulab-jamun-mix', kannadaName: 'ಗುಲಾಬ್ ಜಾಮೂನ್ ಮಿಶ್ರಣ' },
    ],
  },
  {
    slug: 'coffee',
    name: 'Coffee',
    kannadaName: 'ಒಂದು ಕಾಫಿ?',
    products: [{ name: 'Filter Coffee', slug: 'filter-coffee', kannadaName: 'ಫಿಲ್ಟರ್ ಕಾಫಿ' }],
  },
  {
    slug: 'snacks',
    name: 'Snacks',
    kannadaName: 'ಕುರುಕುಲು ತಿಂಡಿ',
    products: [
      { name: 'Chakli', slug: 'chakli', kannadaName: 'ಚಕ್ಕುಲಿ' },
      { name: 'Nippat', slug: 'nippat', kannadaName: 'ನಿಪ್ಪಟ್ಟು' },
      { name: 'Kodbale', slug: 'kodbale', kannadaName: 'ಕೋಡುಬಳೆ' },
    ],
  },
] as const;

export const mixPhotoSources = [
  {
    slug: 'rava-idli-mix',
    origin: 'https://shop.orklaindia.com',
    handle: 'rava-idli-mix',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'gulab-jamun-mix',
    origin: 'https://shop.orklaindia.com',
    handle: 'gulab-jamun-mix',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'bisibele-bath',
    origin: 'https://shop.orklaindia.com',
    handle: 'ready-to-eat-bisibele-bhath',
    owner: 'MTR / Orkla India',
    note: 'MTR reference packaging',
  },
  {
    slug: 'chakli',
    origin: 'https://organicmandya.com',
    handle: 'millet-murukku',
    owner: 'Organic Mandya',
    note: 'Organic Mandya reference packaging',
  },
  {
    slug: 'nippat',
    origin: 'https://organicmandya.com',
    handle: 'nippattu',
    owner: 'Organic Mandya',
    note: 'Organic Mandya reference packaging',
  },
  {
    slug: 'kodbale',
    origin: 'https://organicmandya.com',
    handle: 'kodbale',
    owner: 'Organic Mandya',
    note: 'Organic Mandya reference packaging',
  },
] as const;
