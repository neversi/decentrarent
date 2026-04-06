export interface User {
  id: string;
  wallet_address: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  display_name: string;
  created_at: string;
  balance: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}
