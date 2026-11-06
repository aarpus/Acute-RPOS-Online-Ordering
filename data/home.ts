// Temporary API data. Edit the content here.
export const homeData = {
  "store": {
    "id": "spice-table",
    "name": "Spice Table",
    "logo": "/images/logo.png",
    "tagline": "Indian flavours · Modern plates",
    "address": "123 Maple Avenue, Riverside, CA 92507",
    "phone": "(951) 555-0123",
    "hours": "11:00 AM – 10:00 PM",
    "currency": "USD",
    "locale": "en-US",
    "timezone": "America/Los_Angeles"
  },
  "header": {
    "locations": ["Downtown", "Westside", "Riverside"],
    "links": [
      {
        "label": "Menu",
        "href": "#menu"
      },
      {
        "label": "Our Story",
        "href": "#story"
      },
      {
        "label": "Contact",
        "href": "#contact"
      }
    ]
  },
  "hero": {
    "eyebrow": "Bold spices. Fresh ingredients.\nTruly memorable food.",
    "title": "Good Food\nBrings People Together.",
    "image": "/images/hero.jpg",
    "imageAlt": "Paneer curry with aromatic Indian spices"
  },
  "categories": [
    {
      "id": "all",
      "name": "All",
      "image": "/images/category-0.jpg"
    },
    {
      "id": "popular",
      "name": "Popular",
      "image": "/images/category-1.jpg"
    },
    {
      "id": "biryani",
      "name": "Biryani",
      "image": "/images/biryani.jpg"
    },
    {
      "id": "curries",
      "name": "Curries",
      "image": "/images/category-3.jpg"
    },
    {
      "id": "kebabs",
      "name": "Kebabs",
      "image": "/images/category-4.jpg"
    },
    {
      "id": "wraps",
      "name": "Wraps & Rolls",
      "image": "/images/category-5.jpg"
    },
    {
      "id": "bowls",
      "name": "Bowls",
      "image": "/images/category-6.jpg"
    },
    {
      "id": "breads",
      "name": "Breads",
      "image": "/images/category-7.jpg"
    },
    {
      "id": "sides",
      "name": "Sides",
      "image": "/images/category-8.jpg"
    },
    {
      "id": "desserts",
      "name": "Desserts",
      "image": "/images/category-9.jpg"
    },
    {
      "id": "beverages",
      "name": "Beverages",
      "image": "/images/category-10.jpg"
    }
  ],
  "products": [
    {
      "id": "paneer-wrap",
      "name": "Paneer Tikka Wrap",
      "description": "Grilled paneer, fresh veggies, house spices, mint chutney",
      "price": 11.99,
      "image": "/images/wrap.jpg",
      "categoryId": "wraps",
      "popular": true,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 11.99
        },
        {
          "id": "large",
          "name": "Large (extra filling)",
          "price": 13.99
        }
      ],
      "extras": [
        {
          "id": "cheese",
          "name": "Extra Cheese",
          "price": 1.5
        }
      ],
      "gallery": [
        "/images/wrap-detail.jpg",
        "/images/wrap.jpg"
      ]
    },
    {
      "id": "chicken-biryani",
      "name": "Chicken Biryani",
      "description": "Aromatic basmati rice, tender chicken, rich spices",
      "price": 15.99,
      "image": "/images/biryani.jpg",
      "categoryId": "biryani",
      "popular": true,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 15.99
        },
        {
          "id": "large",
          "name": "Large (extra filling)",
          "price": 17.99
        }
      ],
      "extras": [],
      "gallery": [
        "/images/biryani.jpg"
      ]
    },
    {
      "id": "butter-chicken",
      "name": "Butter Chicken",
      "description": "Creamy tomato gravy, tender chicken pieces",
      "price": 16.99,
      "image": "/images/chicken.jpg",
      "categoryId": "curries",
      "popular": true,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 16.99
        },
        {
          "id": "large",
          "name": "Large (extra filling)",
          "price": 18.99
        }
      ],
      "extras": [],
      "gallery": [
        "/images/chicken.jpg"
      ]
    },
    {
      "id": "chana-bowl",
      "name": "Chana Masala Bowl",
      "description": "Spiced chickpeas, rice, fresh salad, chutney",
      "price": 12.99,
      "image": "/images/bowl.jpg",
      "categoryId": "bowls",
      "popular": true,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 12.99
        },
        {
          "id": "large",
          "name": "Large (extra filling)",
          "price": 14.99
        }
      ],
      "extras": [],
      "gallery": [
        "/images/bowl.jpg"
      ]
    },
    {
      "id": "garlic-naan",
      "name": "Garlic Naan",
      "description": "Fresh tandoori bread with garlic and butter",
      "price": 3.99,
      "image": "/images/naan.jpg",
      "categoryId": "breads",
      "popular": false,
      "sizes": [
        {
          "id": "regular",
          "name": "1 piece",
          "price": 3.99
        }
      ],
      "extras": [],
      "gallery": [
        "/images/naan.jpg"
      ]
    },
    {
      "id": "chicken-wrap",
      "name": "Chicken Tikka Wrap",
      "description": "Grilled chicken, fresh vegetables and mint chutney",
      "price": 12.99,
      "image": "/images/wrap.jpg",
      "categoryId": "wraps",
      "popular": false,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 12.99
        },
        {
          "id": "large",
          "name": "Large (extra filling)",
          "price": 14.99
        }
      ],
      "extras": [
        {
          "id": "cheese",
          "name": "Extra Cheese",
          "price": 1.5
        }
      ],
      "gallery": [
        "/images/wrap.jpg"
      ]
    },
    {
      "id": "samosas",
      "name": "Samosas (2 pcs)",
      "description": "Crispy pastry filled with spiced potatoes and peas",
      "price": 6.99,
      "image": "/images/samosas.jpg",
      "categoryId": "sides",
      "popular": false,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 6.99
        }
      ],
      "extras": [],
      "gallery": [
        "/images/samosas.jpg"
      ]
    },
    {
      "id": "mango-lassi",
      "name": "Mango Lassi",
      "description": "Sweet mango blended with creamy yogurt",
      "price": 4.99,
      "image": "/images/lassi.jpg",
      "categoryId": "beverages",
      "popular": false,
      "sizes": [
        {
          "id": "regular",
          "name": "Regular",
          "price": 4.99
        }
      ],
      "extras": [],
      "gallery": [
        "/images/lassi.jpg"
      ]
    }
  ],
  "footer": {
    "copyright": "© 2026 Spice Table. All rights reserved.",
    "links": [
      {
        "label": "Privacy Policy",
        "href": "#privacy"
      },
      {
        "label": "Terms & Conditions",
        "href": "#terms"
      }
    ],
    "closingLine": "Good Food Brings People Together.",
    "story": "Indian flavours, fresh ingredients and modern plates. We bring people together over carefully prepared food."
  },
  "ordering": {
    "storeImage": "/images/store.jpg",
    "readyMinutes": "20–25 mins",
    "deliveryMinutes": "30–40 min",
    "deliveryFee": 3.99,
    "promo": {
      "code": "SPICE10",
      "percent": 10
    },
    "daysAhead": 7,
    "timeSlots": [
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "18:00",
      "18:30",
      "19:00",
      "19:30",
      "20:00"
    ],
    "paymentMethods": [
      {
        "id": "card",
        "name": "Credit or Debit Card",
        "description": "Visa, Mastercard, RuPay and more"
      },
      {
        "id": "wallet",
        "name": "Wallet / UPI",
        "description": "Google Pay, PhonePe, Paytm"
      },
      {
        "id": "cash",
        "name": "Cash on Delivery / Pickup",
        "description": "Pay when you receive your order"
      }
    ]
  }
};

export type StockRequirement = { key: string; available: number; units: number; allowBackorder?: boolean };
export type OptionGroup = { id: string; name: string; min: number; max: number; variantId: string | null; options: string[]; defaults: string[] };
type SampleProduct = typeof homeData.products[number];
export type Product = Omit<SampleProduct, 'sizes' | 'extras'> & {
  categoryIds?: string[];
  sizes: (SampleProduct['sizes'][number] & { stock?: StockRequirement[] })[];
  extras: (SampleProduct['extras'][number] & { stock?: StockRequirement[]; variantId?: string | null })[];
  minimumQuantity?: number; maximumQuantity?: number; allowSpecialInstructions?: boolean;
  specialInstructionsMaxLength?: number; optionGroups?: OptionGroup[];
};
export type HomeData = Omit<typeof homeData, 'products'> & { products: Product[] };
