use anchor_lang::prelude::*;
use anchor_lang::system_program;
use error::EscrowError;
use models::*;

mod error;
mod models;

declare_id!("GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY");

#[program]
pub mod lease {
    use super::*;

    /// Шаг 1
    /// Арендатор переводит только депозит аренда платится отдельно через pay_rent
    pub fn lock_deposit(
        ctx: Context<LockDeposit>,
        order_id: [u8; 16],
        deposit_amount: u64,
        deadline_ts: i64,
        period: i64,
        start_date: i64,
        end_date: i64,
        price_rent: u64,
    ) -> Result<()> {
        require!(deposit_amount > 0, EscrowError::InvalidAmount);
        require!(price_rent > 0, EscrowError::InvalidAmount);
        require!(period > 0, EscrowError::InvalidPeriod);

        let clock = Clock::get()?;
        require!(
            deadline_ts > clock.unix_timestamp,
            EscrowError::InvalidDeadline
        );
        require!(
            end_date > clock.unix_timestamp,
            EscrowError::InvalidEndDate
        );
        require!(
            end_date > start_date,
            EscrowError::InvalidTimestamp
        );
        require!(
            (end_date - start_date) % period == 0,
            EscrowError::InvalidPeriod
        );

        let escrow_info = ctx.accounts.escrow.to_account_info();
        let escrow = &mut ctx.accounts.escrow;
        escrow.order_id = order_id;
        escrow.landlord = ctx.accounts.landlord.key();
        escrow.tenant = ctx.accounts.tenant.key();
        escrow.authority = ctx.accounts.authority.key();
        escrow.deposit_amount = deposit_amount;
        escrow.total_rent_paid = 0;
        escrow.status = EscrowStatus::AwaitingSignatures;
        escrow.deadline = deadline_ts;
        escrow.landlord_signed = false;
        escrow.tenant_signed = false;
        escrow.bump = ctx.bumps.escrow;
        escrow.period = period;
        escrow.start_date = start_date;
        escrow.end_date = end_date;
        escrow.price_rent = price_rent;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.tenant.to_account_info(),
                    to: escrow_info,
                },
            ),
            deposit_amount,
        )?;

        emit!(DepositLocked {
            escrow: escrow.key(),
            landlord: escrow.landlord,
            tenant: escrow.tenant,
            deposit_amount,
            deadline: deadline_ts,
        });
        msg!("Deposit locked: {} lamports", deposit_amount);

        Ok(())
    }

    /// Шаг 2.1
    /// Арендодатель подписывает договор on-chain
    pub fn landlord_sign(ctx: Context<LandlordSign>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::AwaitingSignatures,
            EscrowError::InvalidStatus
        );
        require!(!escrow.landlord_signed, EscrowError::AlreadySigned);
        require!(
            clock.unix_timestamp <= escrow.deadline,
            EscrowError::DeadlineExpired
        );

        escrow.landlord_signed = true;
        if escrow.tenant_signed {
            escrow.status = EscrowStatus::Active;
            emit!(DocumentSigned {
                escrow: escrow.key(),
                order_id: escrow.order_id,
            });
        }

        emit!(PartySignedEvent {
            escrow: escrow.key(),
            signer: ctx.accounts.landlord.key(),
            role: "landlord".to_string(),
        });
        msg!("Landlord signed");

        Ok(())
    }

    /// Шаг 2.2
    /// Арендатор подписывает договор on-chain
    pub fn tenant_sign(ctx: Context<TenantSign>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::AwaitingSignatures,
            EscrowError::InvalidStatus
        );
        require!(!escrow.tenant_signed, EscrowError::AlreadySigned);
        require!(
            clock.unix_timestamp <= escrow.deadline,
            EscrowError::DeadlineExpired
        );

        escrow.tenant_signed = true;
        if escrow.landlord_signed {
            escrow.status = EscrowStatus::Active;
            emit!(DocumentSigned {
                escrow: escrow.key(),
                order_id: escrow.order_id,
            });
        }

        emit!(PartySignedEvent {
            escrow: escrow.key(),
            signer: ctx.accounts.tenant.key(),
            role: "tenant".to_string(),
        });
        msg!("Tenant signed");

        Ok(())
    }

    /// Шаг 3
    /// Арендатор платит за месяц аренды
    pub fn pay_rent(ctx: Context<PayRent>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );
        require!(
            amount == escrow.price_rent,
            EscrowError::InvalidAmount
        );

        let total_periods = (escrow.end_date - escrow.start_date)
            .checked_div(escrow.period)
            .ok_or(EscrowError::InvalidPeriod)? as u64;

        let max_total = escrow.price_rent
            .checked_mul(total_periods)
            .ok_or(EscrowError::Overflow)?;

        let new_total = escrow.total_rent_paid
            .checked_add(amount)
            .ok_or(EscrowError::Overflow)?;

        require!(new_total <= max_total, EscrowError::RentOverpaid);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.tenant.to_account_info(),
                    to: ctx.accounts.landlord.to_account_info(),
                },
            ),
            amount,
        )?;

        escrow.total_rent_paid = new_total;
        let clock = Clock::get()?;

        emit!(RentPaid {
            escrow: escrow.key(),
            tenant: ctx.accounts.tenant.key(),
            landlord: ctx.accounts.landlord.key(),
            amount,
            total_paid: escrow.total_rent_paid,
            paid_at: clock.unix_timestamp,
        });
        msg!("Rent paid: {} lamports -> landlord", amount);

        Ok(())
    }

    /// Вернуть депозит арендатору — нормальное окончание аренды
    pub fn release_deposit_to_tenant(ctx: Context<ReleaseDeposit>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus,
        );

        let deposit = escrow.deposit_amount;
        escrow.status = EscrowStatus::Settled;

        **escrow.to_account_info().try_borrow_mut_lamports()? -= deposit;
        **ctx
            .accounts
            .tenant
            .to_account_info()
            .try_borrow_mut_lamports()? += deposit;

        emit!(DepositReleased {
            escrow: escrow.key(),
            recipient: ctx.accounts.tenant.key(),
            amount: deposit,
            reason: "normal_end".to_string()
        });
        msg!("Deposit returned to tenant: {} lamports", deposit);

        Ok(())
    }

    /// Открыть спор - депозит замораживается
    pub fn open_dispute(ctx: Context<AuthorityOnly>, reason: String) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Active,
            EscrowError::InvalidStatus
        );
        require!(reason.len() <= 200, EscrowError::ReasonTooLong);

        escrow.status = EscrowStatus::Disputed;
        emit!(DisputeOpened {
            escrow: escrow.key(),
            reason
        });
        msg!("Dispute opened");

        Ok(())
    }

    /// Спор решен в пользу арендатора - депозит возвращается ему
    pub fn resolve_dispute_tenant(ctx: Context<ReleaseDeposit>, reason: String) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );
        require!(reason.len() <= 200, EscrowError::ReasonTooLong);

        let deposit = escrow.deposit_amount;
        escrow.status = EscrowStatus::DisputeResolvedTenant;

        **escrow.to_account_info().try_borrow_mut_lamports()? -= deposit;
        **ctx
            .accounts
            .tenant
            .to_account_info()
            .try_borrow_mut_lamports()? += deposit;

        emit!(DepositReleased {
            escrow: escrow.key(),
            recipient: ctx.accounts.tenant.key(),
            amount: deposit,
            reason,
        });
        msg!("Dispute resolved for tenant: {} lamports returned", deposit);

        Ok(())
    }

    /// Спор решен в пользу арендодателя - депозит выплачивается ему
    pub fn resolve_dispute_landlord(ctx: Context<ReleaseDeposit>, reason: String) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(
            escrow.status == EscrowStatus::Disputed,
            EscrowError::InvalidStatus
        );
        require!(reason.len() <= 200, EscrowError::ReasonTooLong);

        let deposit = escrow.deposit_amount;
        escrow.status = EscrowStatus::DisputeResolvedLandlord;

        **escrow.to_account_info().try_borrow_mut_lamports()? -= deposit;
        **ctx
            .accounts
            .landlord
            .to_account_info()
            .try_borrow_mut_lamports()? += deposit;

        emit!(DepositReleased {
            escrow: escrow.key(),
            recipient: ctx.accounts.landlord.key(),
            amount: deposit,
            reason,
        });
        msg!("Dispute resolved for landlord: {} lamports paid", deposit);

        Ok(())
    }

    /// Дедлайн подписания истек - депозит возвращается арендатору
    pub fn expire_escrow(ctx: Context<ExpireEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let clock = Clock::get()?;

        require!(
            escrow.status == EscrowStatus::AwaitingSignatures,
            EscrowError::InvalidStatus
        );
        require!(
            clock.unix_timestamp > escrow.deadline,
            EscrowError::DeadlineNotReached
        );

        let deposit = escrow.deposit_amount;
        escrow.status = EscrowStatus::Expired;

        **escrow.to_account_info().try_borrow_mut_lamports()? -= deposit;
        **ctx
            .accounts
            .tenant
            .to_account_info()
            .try_borrow_mut_lamports()? += deposit;

        emit!(EscrowExpired {
            escrow: escrow.key(),
            refunded_to: ctx.accounts.tenant.key(),
            amount: deposit
        });
        msg!("Escrow expired. Deposit {} lamports refunded", deposit);

        Ok(())
    }
}
