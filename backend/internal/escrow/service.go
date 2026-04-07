package escrow

import (
	"context"
	"encoding/binary"
	"fmt"
	"regexp"
	"strconv"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

// Anchor custom errors start at 6000 (0x1770).
var anchorErrors = map[int]string{
	6000: "invalid amount",
	6001: "deadline must be in the future",
	6002: "deadline has not been reached yet",
	6003: "escrow deadline has expired",
	6004: "invalid escrow status for this operation",
	6005: "unauthorized signer",
	6006: "already signed",
	6007: "arithmetic overflow",
	6008: "reason too long (max 200 chars)",
	6009: "invalid end date",
	6010: "invalid timestamp",
	6011: "invalid period",
	6012: "rent overpaid",
}

var customErrRe = regexp.MustCompile(`custom program error: 0x([0-9a-fA-F]+)`)

func parseAnchorError(err error) error {
	if err == nil {
		return nil
	}
	m := customErrRe.FindStringSubmatch(err.Error())
	if m == nil {
		return err
	}
	code, parseErr := strconv.ParseInt(m[1], 16, 64)
	if parseErr != nil {
		return err
	}
	if msg, ok := anchorErrors[int(code)]; ok {
		return fmt.Errorf("program error: %s", msg)
	}
	return fmt.Errorf("program error: code 0x%x", code)
}

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

func (s *Service) sendAndConfirm(
	ctx context.Context,
	ix solana.Instruction,
) (string, error) {
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

	sig, err := s.rpc.SendTransactionWithOpts(
		ctx,
		tx,
		rpc.TransactionOpts{
			PreflightCommitment: rpc.CommitmentConfirmed,
			SkipPreflight:       false,
		},
	)

	if err != nil {
		return "", parseAnchorError(err)
	}

	return sig.String(), nil
}

func borshString(s string) []byte {
	b := make([]byte, 4+len(s))
	binary.LittleEndian.PutUint32(b, uint32(len(s)))
	copy(b[4:], s)
	return b
}
