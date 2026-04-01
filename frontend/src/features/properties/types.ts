export interface Property {
  id: string;
  landlord_id: string;
  title: string;
  description: string;
  location: string;
  price: number;
  token_mint: string;
  period_type: string;
  status: string;
  verification_status: string;
  media: PropertyMedia[];
  created_at: string;
  updated_at: string;
}

export interface PropertyMedia {
  id: string;
  url: string;
  sort_order: number;
}

export interface CreatePropertyRequest {
  title: string;
  description: string;
  location: string;
  price: number;
  token_mint: string;
  period_type: string;
}

export interface UpdatePropertyRequest {
  title?: string;
  description?: string;
  location?: string;
  price?: number;
  token_mint?: string;
  period_type?: string;
}
