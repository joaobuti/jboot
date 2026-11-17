package infinitepay

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
)

const defaultBaseURL = "https://api.checkout.infinitepay.io"

type Client struct {
	baseURL     string
	httpClient  *http.Client
	callbackURL string
}

func NewClient(baseURL, callbackURL string, timeout time.Duration) (*Client, error) {
	if strings.TrimSpace(baseURL) == "" {
		baseURL = defaultBaseURL
	}
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return nil, errors.New("InfinitePay base URL must be an absolute HTTPS URL")
	}
	if parsed.Host != "api.checkout.infinitepay.io" && !isLocalTestHost(parsed.Hostname()) {
		return nil, errors.New("InfinitePay base URL host is not allowlisted")
	}
	if timeout < time.Second || timeout > 15*time.Second {
		return nil, errors.New("InfinitePay timeout must be between 1s and 15s")
	}
	return &Client{
		baseURL:     strings.TrimRight(baseURL, "/"),
		callbackURL: strings.TrimRight(callbackURL, "/"),
		httpClient:  &http.Client{Timeout: timeout},
	}, nil
}

func (client *Client) CreateCheckout(ctx context.Context, input domain.CreateCheckoutInput) (domain.CheckoutResult, error) {
	payload := client.buildCreatePayload(input)
	raw, err := client.call(ctx, "/links", payload)
	if err != nil {
		return domain.CheckoutResult{}, err
	}
	return client.parseCreateResponse(raw, input.OrderReference)
}

func (client *Client) CheckPayment(ctx context.Context, input domain.CheckPaymentInput) (domain.ProviderPaymentCheck, error) {
	payload := map[string]string{
		"handle":          input.Handle,
		"order_nsu":       input.OrderReference,
		"transaction_nsu": input.TransactionNSU,
		"slug":            input.Slug,
	}
	raw, err := client.call(ctx, "/payment_check", payload)
	if err != nil {
		return domain.ProviderPaymentCheck{}, err
	}
	return client.parsePaymentCheck(raw)
}

func (client *Client) buildCreatePayload(input domain.CreateCheckoutInput) map[string]any {
	callback := client.callbackURL + "/v1/public/infinitepay/callback/" + input.ChargeID
	return map[string]any{
		"handle": input.Handle,
		"items": []map[string]any{{
			"quantity":    1,
			"price":       input.AmountMinor,
			"description": "Venda JBoot PDV",
		}},
		"order_nsu":    input.OrderReference,
		"redirect_url": callback,
	}
}

func (client *Client) call(ctx context.Context, path string, payload any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("encode InfinitePay request: %w", err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, client.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build InfinitePay request: %w", err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("call InfinitePay: %w", domain.ErrProviderUnavailable)
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if err != nil {
		return nil, fmt.Errorf("read InfinitePay response: %w", domain.ErrProviderUnavailable)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("InfinitePay returned HTTP %d: %w", response.StatusCode, domain.ErrProviderUnavailable)
	}
	return raw, nil
}

func (client *Client) parseCreateResponse(raw []byte, orderReference string) (domain.CheckoutResult, error) {
	var response struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		return domain.CheckoutResult{}, fmt.Errorf("decode InfinitePay create response: %w", domain.ErrProviderUnavailable)
	}
	checkoutURL, err := url.Parse(response.URL)
	if err != nil || checkoutURL.Scheme != "https" || checkoutURL.Host != "checkout.infinitepay.io" {
		return domain.CheckoutResult{}, fmt.Errorf("invalid InfinitePay checkout URL: %w", domain.ErrProviderUnavailable)
	}
	return domain.CheckoutResult{URL: response.URL, ExternalOrderReference: orderReference}, nil
}

func (client *Client) parsePaymentCheck(raw []byte) (domain.ProviderPaymentCheck, error) {
	var response struct {
		Success       bool   `json:"success"`
		Paid          bool   `json:"paid"`
		Amount        int64  `json:"amount"`
		PaidAmount    int64  `json:"paid_amount"`
		Installments  int    `json:"installments"`
		CaptureMethod string `json:"capture_method"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		return domain.ProviderPaymentCheck{}, fmt.Errorf("decode InfinitePay payment check: %w", domain.ErrProviderUnavailable)
	}
	return domain.ProviderPaymentCheck{
		Success: response.Success, Paid: response.Paid,
		AmountMinor: response.Amount, PaidAmount: response.PaidAmount,
		Installments: response.Installments, CaptureMethod: response.CaptureMethod,
	}, nil
}

func isLocalTestHost(host string) bool {
	return host == "127.0.0.1" || host == "localhost"
}
