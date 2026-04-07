export interface Conversation {
  id: string;
  property_id: string;
  landlord_id: string;
  loaner_id: string;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
}

export type MessageType = 'text' | 'system' | 'modal' | 'document';

export interface MessageMeta {
  // document
  document_url?: string;
  document_name?: string;
  order_id?: string;
  // modal
  modal_action?: string;
  modal_status?: string;
  modal_id?: string;
  // system
  event_type?: string;

  tx?: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type?: MessageType;
  metadata?: MessageMeta;
  created_at: string;
}
