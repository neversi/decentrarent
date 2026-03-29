package media

import (
	"context"
	"fmt"
	"net/url"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type S3Client struct {
	client       *minio.Client // internal: bucket ops, delete, etc.
	signClient   *minio.Client // public endpoint: presigned URL generation
	bucket       string
}

func NewS3Client(endpoint, publicEndpoint, accessKey, secretKey, bucket string, useSSL bool) (*S3Client, error) {
	// Internal client for operations (reachable inside Docker)
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}

	// Signing client for presigned URLs (uses public-facing hostname so signatures match)
	// Set region explicitly to avoid a network call to resolve it
	signClient, err := minio.New(publicEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: useSSL,
		Region: "us-east-1",
	})
	if err != nil {
		return nil, err
	}

	// Auto-create bucket using internal client
	ctx := context.Background()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}

	return &S3Client{client: client, signClient: signClient, bucket: bucket}, nil
}

func (s *S3Client) GenerateUploadURL(propertyID, fileName string) (uploadURL, fileKey string, err error) {
	ext := filepath.Ext(fileName)
	fileKey = fmt.Sprintf("properties/%s/%s%s", propertyID, uuid.New().String(), ext)

	// Use signClient so the signature is computed for the public host
	presignedURL, err := s.signClient.PresignedPutObject(context.Background(), s.bucket, fileKey, 15*time.Minute)
	if err != nil {
		return "", "", err
	}

	return presignedURL.String(), fileKey, nil
}

func (s *S3Client) GenerateDownloadURL(fileKey string) (string, error) {
	reqParams := make(url.Values)
	// Use signClient so the signature is computed for the public host
	presignedURL, err := s.signClient.PresignedGetObject(context.Background(), s.bucket, fileKey, 1*time.Hour, reqParams)
	if err != nil {
		return "", err
	}
	return presignedURL.String(), nil
}

func (s *S3Client) DeleteObject(fileKey string) error {
	return s.client.RemoveObject(context.Background(), s.bucket, fileKey, minio.RemoveObjectOptions{})
}
