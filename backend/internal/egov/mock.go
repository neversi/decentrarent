package egov

type VerificationResult struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

type Verifier interface {
	Verify(location string, ownerWallet string) (*VerificationResult, error)
}

type MockVerifier struct{}

func NewMockVerifier() *MockVerifier {
	return &MockVerifier{}
}

func (m *MockVerifier) Verify(location, ownerWallet string) (*VerificationResult, error) {
	return &VerificationResult{
		Status:  "verified",
		Message: "mock: auto-accepted",
	}, nil
}
