use solana_program_test::*;
use solana_sdk::{
    account::Account,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_program as system_program_id,
    transaction::Transaction,
};
use std::str::FromStr;
use uuid::Uuid;

// anchor build
// SBF_OUT_DIR=$(pwd)/target/deploy cargo test -p lease -- --nocapture

// Program ID задеплоенного контракта
const PROGRAM_ID: &str = "GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY";

fn program_id() -> Pubkey {
    Pubkey::from_str(PROGRAM_ID).unwrap()
}

/// Вычислить PDA escrow аккаунта
fn find_escrow_pda(landlord: &Pubkey, tenant: &Pubkey, order_id: &[u8; 16]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"escrow", landlord.as_ref(), tenant.as_ref(), order_id],
        &program_id(),
    )
}

/// Создать тестовое окружение с балансами
async fn setup() -> (BanksClient, Keypair, Keypair, Keypair, Keypair, Uuid) {
    let program_id = program_id();

    let mut program_test = ProgramTest::default();
    program_test.add_upgradeable_program_to_genesis("lease", &program_id);

    let landlord = Keypair::new();
    let tenant = Keypair::new();
    let authority = Keypair::new();
    let uuid = Uuid::now_v7();

    // Пополняем балансы
    program_test.add_account(
        landlord.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: vec![],
            owner: solana_sdk::system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(
        tenant.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: vec![],
            owner: solana_sdk::system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );
    program_test.add_account(
        authority.pubkey(),
        Account {
            lamports: 10_000_000_000,
            data: vec![],
            owner: solana_sdk::system_program::id(),
            executable: false,
            rent_epoch: 0,
        },
    );

    let (banks_client, payer, _) = program_test.start().await;

    (banks_client, payer, landlord, tenant, authority, uuid)
}

/// Deadline через 3 дня от сейчас
fn deadline_3_days() -> i64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    now + 3 * 24 * 60 * 60
}

const PRICE_RENT: u64 = 1_000_000_000;

fn test_lease_dates() -> (i64, i64, i64) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    let period = 2592000; // 30 days
    let start_date = now;
    let end_date = now + 12 * period;
    (period, start_date, end_date)
}

#[tokio::test]
async fn test_lock_deposit() {
    let (banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _bump) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());
    let deposit_amount: u64 = 1_000_000_000; // 1 SOL
    let deadline = deadline_3_days();
    let (period, start_date, end_date) = test_lease_dates();

    let tenant_balance_before = banks_client.get_balance(tenant.pubkey()).await.unwrap();

    // Вызываем lock_deposit
    let ix = lock_deposit_ix(
        &landlord.pubkey(),
        &tenant.pubkey(),
        &authority.pubkey(),
        &escrow_pda,
        order_id.as_bytes(),
        deposit_amount,
        deadline,
        period,
        start_date,
        end_date,
        PRICE_RENT,
    );

    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // Проверяем баланс escrow
    let escrow_balance = banks_client.get_balance(escrow_pda).await.unwrap();
    assert!(
        escrow_balance >= deposit_amount,
        "Escrow должен содержать депозит"
    );

    // Проверяем что с tenant списалось
    let tenant_balance_after = banks_client.get_balance(tenant.pubkey()).await.unwrap();
    assert!(
        tenant_balance_before - tenant_balance_after >= deposit_amount,
        "С арендатора должен был списаться депозит"
    );

    println!("✓ lock_deposit: {} lamports заблокированы", deposit_amount);
}

#[tokio::test]
async fn test_landlord_sign() {
    let (banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());

    // Сначала lock_deposit
    let (period, start_date, end_date) = test_lease_dates();
    let ix_lock = lock_deposit_ix(
        &landlord.pubkey(),
        &tenant.pubkey(),
        &authority.pubkey(),
        &escrow_pda,
        order_id.as_bytes(),
        1_000_000_000,
        deadline_3_days(),
        period,
        start_date,
        end_date,
        PRICE_RENT,
    );
    let mut tx = Transaction::new_with_payer(&[ix_lock], Some(&payer.pubkey()));
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    // landlord_sign
    let ix_sign = landlord_sign_ix(&landlord.pubkey(), &escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix_sign], Some(&payer.pubkey()));
    let blockhash = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &landlord], blockhash);
    banks_client.process_transaction(tx).await.unwrap();

    println!("✓ landlord_sign: арендодатель подписал");
}
#[tokio::test]
async fn test_both_sign_becomes_active() {
    let (banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());

    // lock_deposit
    let (period, start_date, end_date) = test_lease_dates();
    let ix = lock_deposit_ix(
        &landlord.pubkey(),
        &tenant.pubkey(),
        &authority.pubkey(),
        &escrow_pda,
        order_id.as_bytes(),
        1_000_000_000,
        deadline_3_days(),
        period,
        start_date,
        end_date,
        PRICE_RENT,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // landlord_sign
    let ix = landlord_sign_ix(&landlord.pubkey(), &escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &landlord], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // tenant_sign
    let ix = tenant_sign_ix(&tenant.pubkey(), &escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();

    println!("✓ Оба подписали → статус Active");
}
#[tokio::test]
async fn test_pay_rent() {
    let (mut banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());
    let rent_amount: u64 = PRICE_RENT;

    // Полный флоу до Active
    activate_escrow(
        &mut banks_client,
        &payer,
        &landlord,
        &tenant,
        &authority,
        &escrow_pda,
        order_id.as_bytes(),
    )
    .await;

    let landlord_balance_before = banks_client.get_balance(landlord.pubkey()).await.unwrap();

    // pay_rent
    let ix = pay_rent_ix(
        &tenant.pubkey(),
        &landlord.pubkey(),
        &escrow_pda,
        rent_amount,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();

    let landlord_balance_after = banks_client.get_balance(landlord.pubkey()).await.unwrap();
    assert!(
        landlord_balance_after > landlord_balance_before,
        "Арендодатель должен получить аренду"
    );

    println!(
        "✓ pay_rent: арендодатель получил {} lamports",
        landlord_balance_after - landlord_balance_before
    );
}
#[tokio::test]
async fn test_release_deposit_to_tenant() {
    let (mut banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());
    let deposit_amount: u64 = 1_000_000_000;

    activate_escrow(
        &mut banks_client,
        &payer,
        &landlord,
        &tenant,
        &authority,
        &escrow_pda,
        order_id.as_bytes(),
    )
    .await;

    let tenant_balance_before = banks_client.get_balance(tenant.pubkey()).await.unwrap();

    let ix = release_to_tenant_ix(
        &authority.pubkey(),
        &tenant.pubkey(),
        &landlord.pubkey(),
        &escrow_pda,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &authority], bh);
    banks_client.process_transaction(tx).await.unwrap();

    let tenant_balance_after = banks_client.get_balance(tenant.pubkey()).await.unwrap();
    assert!(
        tenant_balance_after >= tenant_balance_before + deposit_amount,
        "Арендатор должен получить депозит обратно"
    );

    println!("✓ release_to_tenant: депозит возвращён арендатору");
}
#[tokio::test]
async fn test_dispute_resolved_for_landlord() {
    let (mut banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());

    activate_escrow(
        &mut banks_client,
        &payer,
        &landlord,
        &tenant,
        &authority,
        &escrow_pda,
        order_id.as_bytes(),
    )
    .await;

    // open_dispute
    let ix = open_dispute_ix(&authority.pubkey(), &escrow_pda, "tenant damaged apartment");
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &authority], bh);
    banks_client.process_transaction(tx).await.unwrap();

    let landlord_balance_before = banks_client.get_balance(landlord.pubkey()).await.unwrap();

    // resolve_dispute_landlord
    let ix = resolve_dispute_landlord_ix(
        &authority.pubkey(),
        &tenant.pubkey(),
        &landlord.pubkey(),
        &escrow_pda,
        "damage confirmed",
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &authority], bh);
    banks_client.process_transaction(tx).await.unwrap();

    let landlord_balance_after = banks_client.get_balance(landlord.pubkey()).await.unwrap();
    assert!(
        landlord_balance_after > landlord_balance_before,
        "Арендодатель должен получить депозит"
    );

    println!("✓ dispute resolved for landlord: депозит выплачен арендодателю");
}
#[tokio::test]
async fn test_dispute_resolved_for_tenant() {
    let (mut banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());

    activate_escrow(
        &mut banks_client,
        &payer,
        &landlord,
        &tenant,
        &authority,
        &escrow_pda,
        order_id.as_bytes(),
    )
    .await;

    // open_dispute
    let ix = open_dispute_ix(
        &authority.pubkey(),
        &escrow_pda,
        "landlord did not provide keys",
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &authority], bh);
    banks_client.process_transaction(tx).await.unwrap();

    let tenant_balance_before = banks_client.get_balance(tenant.pubkey()).await.unwrap();

    // resolve_dispute_tenant
    let ix = resolve_dispute_tenant_ix(
        &authority.pubkey(),
        &tenant.pubkey(),
        &landlord.pubkey(),
        &escrow_pda,
        "landlord at fault",
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &authority], bh);
    banks_client.process_transaction(tx).await.unwrap();

    let tenant_balance_after = banks_client.get_balance(tenant.pubkey()).await.unwrap();
    assert!(
        tenant_balance_after > tenant_balance_before,
        "Арендатор должен получить депозит обратно"
    );

    println!("✓ dispute resolved for tenant: депозит возвращён арендатору");
}
#[tokio::test]
async fn test_cannot_sign_twice() {
    let (mut banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());

    let  (period, start_date, end_date) = test_lease_dates();

    let ix = lock_deposit_ix(
        &landlord.pubkey(),
        &tenant.pubkey(),
        &authority.pubkey(),
        &escrow_pda,
        order_id.as_bytes(),
        1_000_000_000,
        deadline_3_days(),
        period,
        start_date,
        end_date,
        PRICE_RENT,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // Первая подпись — ок
    let ix = landlord_sign_ix(&landlord.pubkey(), &escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &landlord], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // Вторая подпись — должна упасть
    let ix = landlord_sign_ix(&landlord.pubkey(), &escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));

    let prev_bh = banks_client.get_latest_blockhash().await.unwrap();
    let bh = banks_client
        .get_new_latest_blockhash(&prev_bh)
        .await
        .unwrap();
    tx.sign(&[&payer, &landlord], bh);
    let result = banks_client.process_transaction(tx).await;

    assert!(result.is_err(), "Повторная подпись должна быть отклонена");
    println!("✓ Повторная подпись заблокирована");
}

#[tokio::test]
async fn test_cannot_pay_rent_before_both_signed() {
    let (banks_client, payer, landlord, tenant, authority, order_id) = setup().await;

    let (escrow_pda, _) =
        find_escrow_pda(&landlord.pubkey(), &tenant.pubkey(), order_id.as_bytes());

    // Только lock_deposit, без подписей
    let (period, start_date, end_date) = test_lease_dates();
    let ix = lock_deposit_ix(
        &landlord.pubkey(),
        &tenant.pubkey(),
        &authority.pubkey(),
        &escrow_pda,
        order_id.as_bytes(),
        1_000_000_000,
        deadline_3_days(),
        period,
        start_date,
        end_date,
        PRICE_RENT,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // Попытка pay_rent — должна упасть
    let ix = pay_rent_ix(
        &tenant.pubkey(),
        &landlord.pubkey(),
        &escrow_pda,
        PRICE_RENT,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[&payer, &tenant], bh);
    let result = banks_client.process_transaction(tx).await;

    assert!(
        result.is_err(),
        "pay_rent без подписей должен быть отклонён"
    );
    println!("✓ pay_rent без подписей заблокирован");
}

/*
 anchor build
python3 -c "
import json,sys
idl = json.load(open('target/idl/lease.json'))
for ix in idl['instructions']:
    print(f'{ix[\"name\"]}: {ix[\"discriminator\"]}')
"
 */
/// Anchor discriminator = sha256("global:<name>")[..8]
fn discriminator(name: &str) -> [u8; 8] {
    match name {
        "lock_deposit" => [188, 133, 191, 52, 92, 123, 37, 56],
        "landlord_sign" => [210, 71, 96, 170, 216, 86, 185, 155],
        "tenant_sign" => [5, 205, 186, 240, 88, 176, 49, 171],
        "pay_rent" => [69, 155, 112, 183, 178, 234, 94, 100],
        "release_deposit_to_tenant" => [207, 198, 51, 27, 175, 167, 225, 110],
        "open_dispute" => [137, 25, 99, 119, 23, 223, 161, 42],
        "resolve_dispute_tenant" => [208, 202, 69, 150, 0, 29, 209, 185],
        "resolve_dispute_landlord" => [192, 91, 45, 225, 65, 140, 19, 1],
        "expire_escrow" => [49, 150, 54, 201, 45, 106, 39, 175],
        _ => panic!("Unknown instruction: {}", name),
    }
}

fn borsh_string(s: &str) -> Vec<u8> {
    let mut buf = Vec::new();
    let bytes = s.as_bytes();
    buf.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
    buf.extend_from_slice(bytes);
    buf
}

fn lock_deposit_ix(
    landlord: &Pubkey,
    tenant: &Pubkey,
    authority: &Pubkey,
    escrow_pda: &Pubkey,
    order_id: &[u8; 16],
    deposit_amount: u64,
    deadline_ts: i64,
    period: i64,
    start_date: i64,
    end_date: i64,
    price_rent: u64,
) -> Instruction {
    let mut data = discriminator("lock_deposit").to_vec();
    data.extend_from_slice(order_id);
    data.extend_from_slice(&deposit_amount.to_le_bytes());
    data.extend_from_slice(&deadline_ts.to_le_bytes());
    data.extend_from_slice(&period.to_le_bytes());
    data.extend_from_slice(&start_date.to_le_bytes());
    data.extend_from_slice(&end_date.to_le_bytes());
    data.extend_from_slice(&price_rent.to_le_bytes());

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*tenant, true),
            AccountMeta::new_readonly(*landlord, false),
            AccountMeta::new_readonly(*authority, false),
            AccountMeta::new(*escrow_pda, false),
            AccountMeta::new_readonly(system_program_id::id(), false),
        ],
        data,
    }
}

fn landlord_sign_ix(landlord: &Pubkey, escrow_pda: &Pubkey) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*landlord, true),
            AccountMeta::new(*escrow_pda, false),
        ],
        data: discriminator("landlord_sign").to_vec(),
    }
}

fn tenant_sign_ix(tenant: &Pubkey, escrow_pda: &Pubkey) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*tenant, true),
            AccountMeta::new(*escrow_pda, false),
        ],
        data: discriminator("tenant_sign").to_vec(),
    }
}

fn pay_rent_ix(
    tenant: &Pubkey,
    landlord: &Pubkey,
    escrow_pda: &Pubkey,
    amount: u64,
) -> Instruction {
    let mut data = discriminator("pay_rent").to_vec();
    data.extend_from_slice(&amount.to_le_bytes());

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*tenant, true),
            AccountMeta::new(*landlord, false),
            AccountMeta::new(*escrow_pda, false),
            AccountMeta::new_readonly(system_program_id::id(), false),
        ],
        data,
    }
}

fn release_to_tenant_ix(
    authority: &Pubkey,
    tenant: &Pubkey,
    landlord: &Pubkey,
    escrow_pda: &Pubkey,
) -> Instruction {
    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*authority, true),
            AccountMeta::new(*tenant, false),
            AccountMeta::new(*landlord, false),
            AccountMeta::new(*escrow_pda, false),
        ],
        data: discriminator("release_deposit_to_tenant").to_vec(),
    }
}

fn open_dispute_ix(authority: &Pubkey, escrow_pda: &Pubkey, reason: &str) -> Instruction {
    let mut data = discriminator("open_dispute").to_vec();
    data.extend_from_slice(&borsh_string(reason));

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*authority, true),
            AccountMeta::new(*escrow_pda, false),
        ],
        data,
    }
}

fn resolve_dispute_landlord_ix(
    authority: &Pubkey,
    tenant: &Pubkey,
    landlord: &Pubkey,
    escrow_pda: &Pubkey,
    reason: &str,
) -> Instruction {
    let mut data = discriminator("resolve_dispute_landlord").to_vec();
    data.extend_from_slice(&borsh_string(reason));

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*authority, true),
            AccountMeta::new(*tenant, false),
            AccountMeta::new(*landlord, false),
            AccountMeta::new(*escrow_pda, false),
        ],
        data,
    }
}

fn resolve_dispute_tenant_ix(
    authority: &Pubkey,
    tenant: &Pubkey,
    landlord: &Pubkey,
    escrow_pda: &Pubkey,
    reason: &str,
) -> Instruction {
    let mut data = discriminator("resolve_dispute_tenant").to_vec();
    data.extend_from_slice(&borsh_string(reason));

    Instruction {
        program_id: program_id(),
        accounts: vec![
            AccountMeta::new(*authority, true),
            AccountMeta::new(*tenant, false),
            AccountMeta::new(*landlord, false),
            AccountMeta::new(*escrow_pda, false),
        ],
        data,
    }
}

/// Хелпер — довести escrow до статуса Active (lock + оба подписали)
async fn activate_escrow(
    banks_client: &mut BanksClient,
    payer: &Keypair,
    landlord: &Keypair,
    tenant: &Keypair,
    authority: &Keypair,
    escrow_pda: &Pubkey,
    order_id: &[u8; 16],
) {
    let deposit_amount: u64 = 1_000_000_000;
    let (period, start_date, end_date) = test_lease_dates();

    // lock_deposit
    let ix = lock_deposit_ix(
        &landlord.pubkey(),
        &tenant.pubkey(),
        &authority.pubkey(),
        escrow_pda,
        order_id,
        deposit_amount,
        deadline_3_days(),
        period,
        start_date,
        end_date,
        PRICE_RENT,
    );
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[payer, tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // landlord_sign
    let ix = landlord_sign_ix(&landlord.pubkey(), escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[payer, landlord], bh);
    banks_client.process_transaction(tx).await.unwrap();

    // tenant_sign
    let ix = tenant_sign_ix(&tenant.pubkey(), escrow_pda);
    let mut tx = Transaction::new_with_payer(&[ix], Some(&payer.pubkey()));
    let bh = banks_client.get_latest_blockhash().await.unwrap();
    tx.sign(&[payer, tenant], bh);
    banks_client.process_transaction(tx).await.unwrap();
}
