export interface User {
  id: string;
  wallet_address: string;
  display_name: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface NonceResponse {
  nonce: string;
  message: string;
}
