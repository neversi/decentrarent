use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Deadline has not been reached yet")]
    DeadlineNotReached,
    #[msg("Escrow deadline has expired")]
    DeadlineExpired,
    #[msg("Invalid escrow status for this operation")]
    InvalidStatus,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Already signed")]
    AlreadySigned,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Reason too long (max 200 chars)")]
    ReasonTooLong,
}
