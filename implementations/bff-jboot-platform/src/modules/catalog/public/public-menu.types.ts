export interface PublicMenuProduct {
  id: string;
  name: string;
  description: string | null;
  price: string;
  queueType: 'cozinha' | 'bar' | null;
  imageUrl: string | null;
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  products: PublicMenuProduct[];
}

export interface PublicMenuResponse {
  categories: PublicMenuCategory[];
  uncategorized: {
    name: string;
    products: PublicMenuProduct[];
  };
}
