package user

type Service struct {
	store *Store
}

func NewService(store *Store) *Service {
	return &Service{store: store}
}

func (s *Service) GetOrCreateByWallet(walletAddress string) (*User, error) {
	return s.store.UpsertByWallet(walletAddress)
}
