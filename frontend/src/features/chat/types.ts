export interface Conversation {
  id: string;
  property_id: string;
  landlord_wallet: string;
  loaner_wallet: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_wallet: string;
  content: string;
  created_at: string;
}
