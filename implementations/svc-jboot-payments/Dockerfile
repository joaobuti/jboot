FROM golang:1.25.13-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /out/payments-api ./cmd/api \
    && CGO_ENABLED=0 go build -trimpath -o /out/payments-worker ./cmd/worker

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/payments-api /usr/local/bin/payments-api
COPY --from=build /out/payments-worker /usr/local/bin/payments-worker
EXPOSE 8040
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/payments-api"]
