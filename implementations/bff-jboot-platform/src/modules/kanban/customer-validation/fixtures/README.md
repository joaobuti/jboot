# Fixtures do conversor de documentos

- `chromium-print.pdf`: PDF real de 1 pagina A4 gerado pelo Chromium
  (Playwright `page.pdf`, 2026-10-16) a partir de HTML sintetico sem dado
  pessoal. Testa a renderizacao de PDF com fonte embutida; nao representa
  resposta de API externa.

## password-protected.pdf

`chromium-print.pdf` criptografado com senha de usuario (Ghostscript 2026-10-21):
`gs -sDEVICE=pdfwrite -sOwnerPassword=owner-fixture -sUserPassword=user-fixture -dEncryptionR=3 -dKeyLength=128`.
Cobre a recusa no upload (`customer_document_password_protected`); as senhas sao do
fixture e nao protegem nada.
