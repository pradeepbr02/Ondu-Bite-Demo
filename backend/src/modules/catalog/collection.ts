export const pantryCollection = [
  {
    slug: 'ready-to-eat',
    name: 'Ready to eat',
    kannadaName: 'ಮನೆಯ ರುಚಿ',
    products: [
      { name: 'Upma', slug: 'upma', kannadaName: 'ಉಪ್ಪಿಟ್ಟು', photo: 'Indian Upma.JPG' },
      {
        name: 'Poha',
        slug: 'poha',
        kannadaName: 'ಅವಲಕ್ಕಿ',
        photo: 'Poha, a snack made of flattened rice.jpg',
      },
      { name: 'Idli', slug: 'idli', kannadaName: 'ಇಡ್ಲಿ', photo: 'Idli Sambar.JPG' },
      {
        name: 'Pongal',
        slug: 'pongal',
        kannadaName: 'ಪೊಂಗಲ್',
        photo: 'Ven pongal with sambar and chutney.jpg',
      },
    ],
  },
  {
    slug: 'coffee',
    name: 'Coffee',
    kannadaName: 'ಒಂದು ಕಾಫಿ?',
    products: [
      {
        name: 'Filter Coffee',
        slug: 'filter-coffee',
        kannadaName: 'ಫಿಲ್ಟರ್ ಕಾಫಿ',
        photo: 'Filter kaapi.JPG',
      },
    ],
  },
  {
    slug: 'snacks',
    name: 'Snacks',
    kannadaName: 'ಕುರುಕುಲು ತಿಂಡಿ',
    products: [
      { name: 'Chakli', slug: 'chakli', kannadaName: 'ಚಕ್ಕುಲಿ', photo: 'Chakli in a bowl.jpg' },
      {
        name: 'Nippat',
        slug: 'nippat',
        kannadaName: 'ನಿಪ್ಪಟ್ಟು',
        photo: 'Nippattu (Rice crackers).jpg',
      },
      {
        name: 'Kodbale',
        slug: 'kodbale',
        kannadaName: 'ಕೋಡುಬಳೆ',
        photo: 'Kodubale ~ Deep fried rice and roasted gram savoury rings from South India.jpg',
      },
    ],
  },
  {
    slug: 'dry-fruits',
    name: 'Dry fruits',
    kannadaName: 'ದಿನದ ಒಳ್ಳೆಯ ಅಭ್ಯಾಸ',
    products: [
      {
        name: 'Almonds',
        slug: 'almonds',
        kannadaName: 'ಬಾದಾಮಿ',
        photo: 'Almonds - in shell, shell cracked open, shelled, blanched.jpg',
      },
      { name: 'Cashews', slug: 'cashews', kannadaName: 'ಗೋಡಂಬಿ', photo: 'CASHEW NUTS.jpg' },
      {
        name: 'Pistachios',
        slug: 'pistachios',
        kannadaName: 'ಪಿಸ್ತಾ',
        photo: 'Pistachios in shells.jpg',
      },
      {
        name: 'Walnuts',
        slug: 'walnuts',
        kannadaName: 'ಅಕ್ರೋಟ್',
        photo: 'Walnuts - whole and open with halved kernel.jpg',
      },
      { name: 'Raisins', slug: 'raisins', kannadaName: 'ಒಣ ದ್ರಾಕ್ಷಿ', photo: 'Raisins 01.jpg' },
      { name: 'Dates', slug: 'dates', kannadaName: 'ಖರ್ಜೂರ', photo: 'Dates.jpg' },
      { name: 'Figs', slug: 'figs', kannadaName: 'ಅಂಜೂರ', photo: 'Dried figs.jpg' },
      { name: 'Apricots', slug: 'apricots', kannadaName: 'ಒಣ ಏಪ್ರಿಕಾಟ್', photo: 'Dried apricots.jpg' },
    ],
  },
] as const;
