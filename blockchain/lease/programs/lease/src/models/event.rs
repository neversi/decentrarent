use anchor_lang::prelude::*;

#[event]
pub struct DepositLocked {
    pub escrow: Pubkey,
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub deposit_amount: u64,
    pub deadline: i64,
}

#[event]
pub struct PartySignedEvent {
    pub escrow: Pubkey,
    pub signer: Pubkey,
    pub role: String,
}

#[event]
pub struct RentPaid {
    pub escrow: Pubkey,
    pub tenant: Pubkey,
    pub landlord: Pubkey,
    pub amount: u64,
    pub total_paid: u64,
    pub paid_at: i64,
}

#[event]
pub struct DepositReleased {
    pub escrow: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub reason: String,
}

#[event]
pub struct EscrowExpired {
    pub escrow: Pubkey,
    pub refunded_to: Pubkey,
    pub amount: u64,
}

#[event]
pub struct DisputeOpened {
    pub escrow: Pubkey,
    pub reason: String,
}

#[event]
pub struct DocumentSigned {
    pub escrow: Pubkey,
    pub order_id: [u8; 16],
}
