# Order System — Chat Integration Design

## Overview

Add order creation, negotiation, and on-chain lifecycle management to the chat interface. Both tenants and landlords can create, accept, or reject order proposals within a conversation. On-chain events (deposit locking, signing) are processed via a Solana listener → Kafka → backend consumer pipeline, with real-time Centrifugo notifications pushing updates to both parties.

## Order Lifecycle

### Statuses

| Status | Description |
|---|---|
| `new` | Order proposal created, awaiting other party's response |
| `rejected` | Other party rejected the proposal (terminal) |
| `awaiting_deposit` | Proposal accepted, tenant must lock deposit on-chain |
| `awaiting_signatures` | Deposit confirmed, both parties must sign on-chain |
| `active` | Both parties signed, order is live |
| `disputed` | One party opened a dispute |
| `settled` | Landlord settled the order |
| `expired` | Sign deadline passed (terminal) |
| `dispute_resolved_tenant` | Dispute resolved in tenant's favor (terminal) |
| `dispute_resolved_landlord` | Dispute resolved in landlord's favor (terminal) |

### State Transitions

```
new → rejected           (either party rejects)
new → awaiting_deposit   (either party accepts)
awaiting_deposit → awaiting_signatures  (on-chain: DepositLocked event via Kafka)
awaiting_signatures → active            (on-chain: both PartySignedEvent received via Kafka)
awaiting_signatures → expired           (sign deadline passed)
active → settled                        (landlord settles)
active → disputed                       (either party disputes)
disputed → dispute_resolved_tenant      (admin resolves)
disputed → dispute_resolved_landlord    (admin resolves)
```

Key: transitions from `awaiting_deposit` → `awaiting_signatures` → `active` are driven by on-chain Solana events, not direct API calls.

### Who Can Do What

- **Create order**: Either party (tenant or landlord) within a chat conversation
- **Accept/Reject**: Either party (the one who did NOT create can accept/reject, creator can also cancel/reject)
- **Lock deposit**: Tenant (on-chain `lockDeposit()`)
- **Sign**: Both parties independently (on-chain sign method)
- **Settle**: Landlord
- **Dispute**: Either party

## Backend Changes

### 1. Order Model Updates

Add to `Order` struct:
- `ConversationID string` — links order to the chat conversation
- `CreatedBy string` — wallet address of who created the proposal

Add new statuses:
- `StatusRejected = "rejected"`
- `StatusAwaitingDeposit = "awaiting_deposit"`

Update `AllowedTransitions`:
```
"new" → ["rejected", "awaiting_deposit"]
"awaiting_deposit" → ["awaiting_signatures"]   // only via Kafka handler
"awaiting_signatures" → ["active", "expired"]  // active only via Kafka handler
"active" → ["settled", "disputed"]
"disputed" → ["dispute_resolved_tenant", "dispute_resolved_landlord"]
```

Update `CreateOrderRequest`:
- Add `ConversationID string`
- `PropertyID`, `LandlordID` can be derived from conversation context but kept explicit for validation

### 2. New API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/orders/{id}/accept` | Accept an order proposal → transitions to `awaiting_deposit` |
| `POST` | `/orders/{id}/reject` | Reject an order proposal → transitions to `rejected` |
| `GET` | `/orders?conversation_id={id}` | List all orders for a conversation |

### 3. Kafka — New Topics & Events

New topics for Solana on-chain events (published by the external Solana listener service):

| Topic | Solana Event | Payload |
|---|---|---|
| `solana.deposit.locked` | `DepositLocked` | `{ escrow, landlord, tenant, deposit_amount, deadline }` |
| `solana.party.signed` | `PartySignedEvent` | `{ escrow, signer, role }` |
| `solana.escrow.expired` | `EscrowExpired` | `{ escrow, refunded_to, amount }` |

Reference: `blockchain/lease/programs/lease/src/models/event.rs`

### 4. Order Kafka Consumers (New)

New file: `backend/internal/order/consumers.go`

`OrderConsumers` struct with handlers:

- **`handleDepositLocked`**: Receives `solana.deposit.locked` event → finds order by escrow address → transitions status from `awaiting_deposit` to `awaiting_signatures` → publishes Centrifugo notification to `orders:{conversation_id}`
- **`handlePartySigned`**: Receives `solana.party.signed` event → finds order by escrow address → sets `TenantSigned` or `LandlordSigned` based on role → if both signed, transitions to `active` and publishes `order.activated` → publishes Centrifugo notification
- **`handleEscrowExpired`**: Receives `solana.escrow.expired` event → finds order by escrow address → transitions to `expired` → publishes Centrifugo notification

Consumer group ID: `"order-solana-consumer"`

### 5. Centrifugo Notifications

Publish order events to channel `orders:{conversation_id}` with payload:

```json
{
  "type": "order_update",
  "order_id": "uuid",
  "status": "awaiting_signatures",
  "updated_fields": { "tenant_signed": true },
  "timestamp": "2026-03-31T12:00:00Z"
}
```

Event types to publish:
- `order_created` — new proposal in conversation
- `order_accepted` — proposal accepted
- `order_rejected` — proposal rejected
- `deposit_locked` — deposit confirmed on-chain
- `party_signed` — one party signed
- `order_activated` — both signed, order active
- `order_expired` — deadline passed

## Frontend Changes

### 1. Toast System

New feature module: `features/toast/`

**Toast Store** (`features/toast/store.ts`):
- Zustand store managing a toast queue
- `addToast(toast: Toast)` — adds toast with auto-generated ID and timestamp
- `removeToast(id: string)` — removes by ID
- Auto-dismiss after 5 seconds (configurable per toast)

**Toast types**:
```typescript
type ToastVariant = 'success' | 'error' | 'info' | 'onchain';

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number; // ms, default 5000
}
```

**ToastProvider component** (`features/toast/components/ToastProvider.tsx`):
- Renders toast stack in top-right corner, fixed position
- Inline styles matching app theme (`#141416` bg, colored left border)
- Variants: success (green `#3DD68C`), error (red `#FF4D6A`), info (orange `#E07840`), onchain (purple `#9945FF` with SOL icon)
- Slide-in/out animation via CSS transitions
- Mounted in App.tsx wrapping the router

### 2. Order API Layer

New file: `features/orders/api.ts`

```typescript
createOrder(data: CreateOrderRequest, token: string): Promise<Order>
acceptOrder(orderId: string, token: string): Promise<Order>
rejectOrder(orderId: string, token: string): Promise<Order>
listOrdersByConversation(conversationId: string, token: string): Promise<Order[]>
getOrder(orderId: string, token: string): Promise<Order>
```

### 3. Order Types

New file: `features/orders/types.ts`

```typescript
type OrderStatus = 'new' | 'rejected' | 'awaiting_deposit' | 'awaiting_signatures' | 'active' | 'disputed' | 'settled' | 'expired' | 'dispute_resolved_tenant' | 'dispute_resolved_landlord';

interface Order {
  id: string;
  conversation_id: string;
  property_id: string;
  tenant_id: string;
  landlord_id: string;
  created_by: string;
  deposit_amount: number;
  rent_amount: number;
  token_mint: string;
  escrow_status: OrderStatus;
  escrow_address: string;
  tenant_signed: boolean;
  landlord_signed: boolean;
  sign_deadline: string;
  rent_start_date: string;
  rent_end_date: string;
  dispute_reason: string;
  created_at: string;
  updated_at: string;
}

interface CreateOrderRequest {
  conversation_id: string;
  property_id: string;
  landlord_id: string;
  deposit_amount: number;
  rent_amount: number;
  token_mint: string;        // default: "SOL"
  escrow_address: string;
  rent_start_date: string;
  rent_end_date: string;
  sign_deadline_days: number;
}
```

### 4. Order Centrifugo Hook

New file: `features/orders/hooks/useOrderUpdates.ts`

- Subscribes to Centrifugo channel `orders:{conversationId}`
- On `order_created` → show info toast to the other party, add order to local state
- On `order_accepted` → show success toast, update order status
- On `order_rejected` → show error toast, update order status
- On `deposit_locked` → show onchain toast, update order status
- On `party_signed` → show onchain toast, update signed flags
- On `order_activated` → show success toast, update order status
- On `order_expired` → show error toast, update order status
- Updates both the inline chat cards and the side panel

### 5. Chat UI Components

#### Create Order Button
- Located in chat header, next to the Orders toggle button
- Opens `CreateOrderModal`

#### CreateOrderModal
- Quick proposal mode: rent amount (pre-filled from property price), deposit amount, start date, end date
- "Advanced" expandable section: token mint (default SOL with icon), sign deadline days (default 7)
- On submit: calls `createOrder()` API → shows success toast → order appears as inline card in chat

#### Inline Order Card (`OrderCard.tsx`)
- Rendered in the chat message flow as a special message type
- Displays: order details (rent, deposit, dates, creator), status badge
- Action buttons change based on status and viewer role:
  - `new`: Accept / Reject (shown to the other party; creator sees "Pending" state)
  - `awaiting_deposit`: "Lock Deposit" button (tenant only, triggers `useLockDeposit()` hook)
  - `awaiting_signatures`: "Sign Order" button (triggers on-chain sign), shows checkmarks for who has signed
  - `active`: status display only (green badge)
  - `rejected`/`expired`: grayed out, no actions

#### Orders Side Panel (`OrdersPanel.tsx`)
- Toggled via "Orders" button in chat header with badge count
- Slides in from the right side of the chat
- Lists all orders for the conversation, sorted by creation date (newest first)
- Each order shows: order number, status badge, amounts with SOL icon, dates, signature progress
- Rejected/expired orders shown with reduced opacity
- Bottom summary: total orders, active count

### 6. System Messages in Chat
When order events happen, system messages appear inline in the chat (already partially implemented in `chat/consumers.go`):
- "Order proposal created by {name}"
- "Order accepted — Waiting for deposit"
- "Order rejected"
- "Deposit locked — Waiting for signatures"
- "{Role} signed the order"
- "Both parties signed — Order is now active"

## File Changes Summary

### Backend (New/Modified)
| File | Change |
|---|---|
| `internal/order/model.go` | Add `ConversationID`, `CreatedBy` fields, `rejected`/`awaiting_deposit` statuses, update transitions |
| `internal/order/handler.go` | Add `Accept`, `Reject` endpoints, add `conversation_id` filter to list |
| `internal/order/service.go` | Add `AcceptOrder`, `RejectOrder` methods, Centrifugo publishing |
| `internal/order/store.go` | Update queries for new fields, add `FindByConversationID`, `FindByEscrowAddress` |
| `internal/order/consumers.go` | **New** — Kafka consumers for `solana.*` topics |
| `internal/kafka/kafka.go` | Add new topic constants for `solana.deposit.locked`, `solana.party.signed`, `solana.escrow.expired` |
| `cmd/server/main.go` | Wire up order consumers |

### Frontend (New/Modified)
| File | Change |
|---|---|
| `features/toast/store.ts` | **New** — Zustand toast store |
| `features/toast/components/ToastProvider.tsx` | **New** — Toast renderer |
| `features/orders/types.ts` | **New** — Order types |
| `features/orders/api.ts` | **New** — Order API functions |
| `features/orders/hooks/useOrderUpdates.ts` | **New** — Centrifugo subscription for order events |
| `features/orders/components/CreateOrderModal.tsx` | **New** — Order creation form modal |
| `features/orders/components/OrderCard.tsx` | **New** — Inline order card for chat |
| `features/orders/components/OrdersPanel.tsx` | **New** — Toggleable side panel |
| `features/chat/components/ChatWindow.tsx` (or equivalent) | Modified — integrate order button, panel toggle, render order cards |
| `App.tsx` | Add `<ToastProvider />` |
