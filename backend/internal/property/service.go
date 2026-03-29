package property

import "github.com/abdro/decentrarent/backend/internal/egov"

type Service struct {
	store    *Store
	verifier egov.Verifier
}

func NewService(store *Store, verifier egov.Verifier) *Service {
	return &Service{store: store, verifier: verifier}
}

func (s *Service) CreateProperty(ownerWallet string, req *CreatePropertyRequest) (*Property, error) {
	result, err := s.verifier.Verify(req.Location, ownerWallet)
	if err != nil {
		return nil, err
	}
	return s.store.Create(ownerWallet, req, result.Status)
}
