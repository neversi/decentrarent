use crate::{EscrowError, EscrowStatus};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(order_id: [u8; 16])]
pub struct LockDeposit<'info> {
    #[account(mut)]
    pub tenant: Signer<'info>,

    /// CHECK: storing landlord pubkey only, no ownership checks needed
    pub landlord: UncheckedAccount<'info>,

    /// CHECK: storing authority pubkey only, no ownership checks needed
    pub authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = tenant,
        space = EscrowAccount::SIZE,
        seeds = [b"escrow", landlord.key().as_ref(), tenant.key().as_ref(), order_id.as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LandlordSign<'info> {
    #[account(mut)]
    pub landlord: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", landlord.key().as_ref(), escrow.tenant.as_ref(), escrow.order_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.landlord == landlord.key() @ EscrowError::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
pub struct TenantSign<'info> {
    #[account(mut)]
    pub tenant: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.landlord.as_ref(), tenant.key().as_ref(), escrow.order_id.as_ref()],
        bump = escrow.bump,
        constraint = escrow.tenant == tenant.key() @ EscrowError::Unauthorized,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
pub struct PayRent<'info> {
    #[account(
        mut,
        constraint = tenant.key() == escrow.tenant @ EscrowError::Unauthorized,
    )]
    pub tenant: Signer<'info>,

    #[account(
        mut,
        constraint = landlord.key() == escrow.landlord @ EscrowError::Unauthorized,
    )]
    /// CHECK: storing authority pubkey only, no ownership checks needed
    pub landlord: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.landlord.as_ref(), tenant.key().as_ref(), escrow.order_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseDeposit<'info> {
    #[account(
        mut,
        constraint = authority.key() == escrow.authority @ EscrowError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut, constraint = tenant.key() == escrow.tenant @ EscrowError::Unauthorized)]
    /// CHECK: storing authority pubkey only, no ownership checks needed
    pub tenant: UncheckedAccount<'info>,

    #[account(mut, constraint = landlord.key() == escrow.landlord @ EscrowError::Unauthorized)]
    /// CHECK: storing authority pubkey only, no ownership checks needed
    pub landlord: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.landlord.as_ref(), escrow.tenant.as_ref(), escrow.order_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
pub struct AuthorityOnly<'info> {
    #[account(
        mut,
        constraint = authority.key() == escrow.authority @ EscrowError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.landlord.as_ref(), escrow.tenant.as_ref(), escrow.order_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

#[derive(Accounts)]
pub struct ExpireEscrow<'info> {
    #[account(
        mut,
        constraint = authority.key() == escrow.authority @ EscrowError::Unauthorized,
    )]
    pub authority: Signer<'info>,

    #[account(mut, constraint = tenant.key() == escrow.tenant @ EscrowError::Unauthorized)]
    /// CHECK: storing authority pubkey only, no ownership checks needed
    pub tenant: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", escrow.landlord.as_ref(), escrow.tenant.as_ref(), escrow.order_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, EscrowAccount>,
}

#[account]
pub struct EscrowAccount {
    pub order_id: [u8; 16],
    pub landlord: Pubkey,
    pub tenant: Pubkey,
    pub authority: Pubkey,
    pub deposit_amount: u64,
    pub total_rent_paid: u64,
    pub status: EscrowStatus,
    pub created_at: i64,
    pub deadline: i64,
    pub landlord_signed: bool,
    pub tenant_signed: bool,
    pub bump: u8,
    pub period: i64,
    pub start_date: i64,
    pub end_date: i64,
    pub price_rent: u64,
}

impl EscrowAccount {
    pub const SIZE: usize = 8 // discriminator
        + 16 // order_id
        + 32 // landlord
        + 32 // tenant
        + 32 // authority
        + 8 // deposit_amount
        + 8 // total_rent_paid
        + 1 // status
        + 8 // created_at
        + 8 // deadline
        + 1 // landlord_signed
        + 1 // tenant_signed
        + 1 // bump
        + 8 // period
        + 8 // start_date
        + 8 // end_date
        + 8; // price_rent
}
