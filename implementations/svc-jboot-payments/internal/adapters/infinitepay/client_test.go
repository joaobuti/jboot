package infinitepay

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jboot-platform/svc-jboot-payments/internal/domain"
)

func TestCreateCheckoutUsesObservedContract(t *testing.T) {
	server := httptest.NewTLSServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/links" {
			t.Fatalf("path = %s", request.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["handle"] != "merchant" || body["order_nsu"] != "charge-1" {
			t.Fatalf("body = %#v", body)
		}
		_, _ = response.Write([]byte(`{"url":"https://checkout.infinitepay.io/merchant?lenc=redacted"}`))
	}))
	defer server.Close()
	client := &Client{baseURL: server.URL, callbackURL: "https://payments.example", httpClient: server.Client()}
	client.httpClient.Timeout = time.Second
	result, err := client.CreateCheckout(context.Background(), domain.CreateCheckoutInput{
		ChargeID: "charge-1", Handle: "merchant", OrderReference: "charge-1", AmountMinor: 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(result.URL, "https://checkout.infinitepay.io/") {
		t.Fatalf("url = %s", result.URL)
	}
}

func TestPaymentCheckParsesRealPositiveShape(t *testing.T) {
	client := &Client{}
	result, err := client.parsePaymentCheck([]byte(`{"success":true,"paid":true,"amount":100,"paid_amount":100,"installments":1,"capture_method":"pix"}`))
	if err != nil {
		t.Fatal(err)
	}
	if !result.Success || !result.Paid || result.AmountMinor != 100 || result.CaptureMethod != "pix" {
		t.Fatalf("result = %#v", result)
	}
}

func TestCreateResponseRejectsArbitraryURL(t *testing.T) {
	client := &Client{}
	if _, err := client.parseCreateResponse([]byte(`{"url":"https://attacker.example/phish"}`), "order"); err == nil {
		t.Fatal("expected checkout URL allowlist rejection")
	}
}
