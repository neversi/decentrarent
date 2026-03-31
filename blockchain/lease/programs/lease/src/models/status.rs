use anchor_lang::prelude::*;
use anchor_lang::{AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum EscrowStatus {
    AwaitingSignatures,      // Депозит получен, ждём подписей в течение deadline
    Active,                  // Оба подписали аренда идёт, pay_rent доступен
    Disputed,                // Спор, депозит заморожен
    Expired,                 // Deadline прошел без подписей, депозит возвращен
    Settled,                 // Депозит выплачен, escrow закрыт
    DisputeResolvedTenant,   // Спор решен в пользу арендатора
    DisputeResolvedLandlord, // Спор решен в пользу арендодателя
}
