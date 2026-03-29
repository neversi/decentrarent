export interface Conversation {
  id: string;
  property_id: string;
  landlord_id: string;
  loaner_id: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}
