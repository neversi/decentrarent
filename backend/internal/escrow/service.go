package escrow

import (
	"context"
	"encoding/binary"
	"fmt"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

const ProgramID = "GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY"

var discriminators = map[string][8]byte{
	"release_deposit_to_tenant":   {207, 198, 51, 27, 175, 167, 225, 110},
	"release_deposit_to_landlord": {192, 91, 45, 225, 65, 140, 19, 1},
	"open_dispute":                {137, 25, 99, 119, 23, 223, 161, 42},
	"resolve_dispute_tenant":      {208, 202, 69, 150, 0, 29, 209, 185},
	"resolve_dispute_landlord":    {192, 91, 45, 225, 65, 140, 19, 1},
	"expire_escrow":               {49, 150, 54, 201, 45, 106, 39, 175},
}

type Service struct {
	rpc       *rpc.Client
	authority *solana.Wallet
	programID solana.PublicKey
}

func NewService(rpcURL, authorityKeyBase58 string) (*Service, error) {
	authority, err := solana.WalletFromPrivateKeyBase58(authorityKeyBase58)
	if err != nil {
		return nil, fmt.Errorf("failed to load authority keypair: %w", err)
	}

	return &Service{
		rpc:       rpc.New(rpcURL),
		authority: authority,
		programID: solana.MustPublicKeyFromBase58(ProgramID),
	}, nil
}

func (s *Service) FindEscrowPDA(landlord, tenant solana.PublicKey, orderID [16]byte) (solana.PublicKey, uint8, error) {
	return solana.FindProgramAddress(
		[][]byte{
			[]byte("escrow"),
			landlord.Bytes(),
			tenant.Bytes(),
			orderID[:],
		},
		s.programID,
	)
}

func (s *Service) ReleaseToTenant(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte) (string, error) {
	escrowPDA, _, err := s.FindEscrowPDA(landlord, tenant, orderID)
	if err != nil {
		return "", err
	}

	disc := discriminators["release_deposit_to_tenant"]
	ix := solana.NewInstruction(
		s.programID,
		solana.AccountMetaSlice{
			{PublicKey: s.authority.PublicKey(), IsSigner: true, IsWritable: true},
			{PublicKey: tenant, IsSigner: false, IsWritable: true},
			{PublicKey: landlord, IsSigner: false, IsWritable: true},
			{PublicKey: escrowPDA, IsSigner: false, IsWritable: true},
		},
		disc[:],
	)

	return s.sendAndConfirm(ctx, ix)
}

func (s *Service) ReleaseToLandlord(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte, reason string) (string, error) {
	escrowPDA, _, err := s.FindEscrowPDA(landlord, tenant, orderID)
	if err != nil {
		return "", err
	}

	disc := discriminators["release_deposit_to_landlord"]
	data := append(disc[:], borshString(reason)...)
	ix := solana.NewInstruction(
		s.programID,
		solana.AccountMetaSlice{
			{PublicKey: s.authority.PublicKey(), IsSigner: true, IsWritable: true},
			{PublicKey: tenant, IsSigner: false, IsWritable: true},
			{PublicKey: landlord, IsSigner: false, IsWritable: true},
			{PublicKey: escrowPDA, IsSigner: false, IsWritable: true},
		},
		data,
	)

	return s.sendAndConfirm(ctx, ix)
}

func (s *Service) OpenDispute(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte, reason string) (string, error) {
	escrowPDA, _, err := s.FindEscrowPDA(landlord, tenant, orderID)
	if err != nil {
		return "", err
	}

	disc := discriminators["open_dispute"]
	data := append(disc[:], borshString(reason)...)
	ix := solana.NewInstruction(
		s.programID,
		solana.AccountMetaSlice{
			{PublicKey: s.authority.PublicKey(), IsSigner: true, IsWritable: true},
			{PublicKey: escrowPDA, IsSigner: false, IsWritable: true},
		},
		data,
	)

	return s.sendAndConfirm(ctx, ix)
}

func (s *Service) ResolveDisputeTenant(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte, reason string) (string, error) {
	return s.resolveDispute(ctx, landlord, tenant, orderID, reason, "resolve_dispute_tenant")
}

func (s *Service) ResolveDisputeLandlord(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte, reason string) (string, error) {
	return s.resolveDispute(ctx, landlord, tenant, orderID, reason, "resolve_dispute_landlord")
}

func (s *Service) resolveDispute(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte, reason, ixName string) (string, error) {
	escrowPDA, _, err := s.FindEscrowPDA(landlord, tenant, orderID)
	if err != nil {
		return "", err
	}

	disc := discriminators[ixName]
	data := append(disc[:], borshString(reason)...)
	ix := solana.NewInstruction(
		s.programID,
		solana.AccountMetaSlice{
			{PublicKey: s.authority.PublicKey(), IsSigner: true, IsWritable: true},
			{PublicKey: tenant, IsSigner: false, IsWritable: true},
			{PublicKey: landlord, IsSigner: false, IsWritable: true},
			{PublicKey: escrowPDA, IsSigner: false, IsWritable: true},
		},
		data,
	)

	return s.sendAndConfirm(ctx, ix)
}

func (s *Service) ExpireEscrow(ctx context.Context, landlord, tenant solana.PublicKey, orderID [16]byte) (string, error) {
	escrowPDA, _, err := s.FindEscrowPDA(landlord, tenant, orderID)
	if err != nil {
		return "", err
	}

	disc := discriminators["expire_escrow"]
	ix := solana.NewInstruction(
		s.programID,
		solana.AccountMetaSlice{
			{PublicKey: s.authority.PublicKey(), IsSigner: true, IsWritable: true},
			{PublicKey: tenant, IsSigner: false, IsWritable: true},
			{PublicKey: escrowPDA, IsSigner: false, IsWritable: true},
		},
		disc[:],
	)

	return s.sendAndConfirm(ctx, ix)
}

// sendAndConfirm отправляет транзакцию и ждёт подтверждения через polling
func (s *Service) sendAndConfirm(ctx context.Context, ix solana.Instruction) (string, error) {
	recent, err := s.rpc.GetLatestBlockhash(ctx, rpc.CommitmentConfirmed)
	if err != nil {
		return "", fmt.Errorf("get blockhash: %w", err)
	}

	tx, err := solana.NewTransaction(
		[]solana.Instruction{ix},
		recent.Value.Blockhash,
		solana.TransactionPayer(s.authority.PublicKey()),
	)
	if err != nil {
		return "", fmt.Errorf("build tx: %w", err)
	}

	_, err = tx.Sign(func(key solana.PublicKey) *solana.PrivateKey {
		if key == s.authority.PublicKey() {
			return &s.authority.PrivateKey
		}
		return nil
	})
	if err != nil {
		return "", fmt.Errorf("sign tx: %w", err)
	}

	sig, err := s.rpc.SendTransaction(ctx, tx)
	if err != nil {
		return "", fmt.Errorf("send tx: %w", err)
	}

	// Polling подтверждения
	//if err := s.pollConfirmation(ctx, sig); err != nil {
	//	return sig.String(), fmt.Errorf("confirm tx: %w", err)
	//}

	return sig.String(), nil
}

func (s *Service) pollConfirmation(ctx context.Context, sig solana.Signature) error {
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		resp, err := s.rpc.GetSignatureStatuses(ctx, false, sig)
		if err != nil || resp == nil || len(resp.Value) == 0 || resp.Value[0] == nil {
			continue
		}

		status := resp.Value[0]
		if status.Err != nil {
			return fmt.Errorf("transaction failed: %v", status.Err)
		}
		if status.ConfirmationStatus == rpc.ConfirmationStatusConfirmed ||
			status.ConfirmationStatus == rpc.ConfirmationStatusFinalized {
			return nil
		}
	}

	return fmt.Errorf("transaction not confirmed after 30 attempts")
}

func borshString(s string) []byte {
	b := make([]byte, 4+len(s))
	binary.LittleEndian.PutUint32(b, uint32(len(s)))
	copy(b[4:], s)
	return b
}
