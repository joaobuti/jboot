# Testar QR code no celular a partir do ambiente local (WSL2)

Runbook reaproveitável para qualquer feature que gere um QR apontando para uma
página do dev local e precise ser escaneada por um celular (ou outro dispositivo
fora da máquina). Criado a partir do teste do QR de mesa da **comanda**
(2026-08-24). Método, comandos e armadilhas já validados de ponta a ponta.

> Escopo: **teste local**. Nada aqui vai para produção. As URLs de túnel são
> efêmeras e mudam a cada restart.

---

## Por que não "só abrir o IP no celular"

No **WSL2** as portas do dev ficam presas na rede interna do WSL2, invisíveis para
o celular no Wi-Fi. Além disso, uma página web moderna quase nunca é autossuficiente:
o **navegador do celular** (não o servidor Next) faz `fetch` na API. Então o celular
precisa alcançar **dois** serviços, não um:

- o **web** (Next dev, ex. porta 3002)
- a **API** que a página consome via `fetch` client-side (ex. porta 8010)

Como saber se é client-side? Se o componente da página tem `"use client"` e a lib de
API usa `fetch(BASE + path)` com `BASE` vindo de `NEXT_PUBLIC_*` — é o navegador do
celular quem chama. Foi o caso da comanda
(`src/modules/comanda/lib/comanda-public-api.ts`).

## Abordagem escolhida: cloudflared quick tunnel

- **Grátis, sem conta, sem domínio, sem cartão.** Comando `cloudflared tunnel --url ...`
  gera uma URL `https://<aleatoria>.trycloudflare.com`.
- Ignora a rede do WSL2 (sai de dentro pra fora), então **não** exige mexer em
  `netsh portproxy`, firewall do Windows nem descobrir o IP do WSL2 (que muda no reboot).
- Preferido sobre **ngrok** grátis: o ngrok mostra uma página de aviso (interstitial)
  que atrapalha o fluxo do QR. O cloudflared entrega direto.
- Túnel dá **HTTPS**, então não há mixed-content ao chamar a API por HTTPS.

Contrapartidas: a URL **muda a cada restart** do túnel (não serve pra produção) e o
túnel é um processo long-running (some quando você encerra).

---

## Pré-requisitos verificados uma vez

1. **Portas publicadas no host WSL2.** Confirmar em `docker-compose.yml` que as portas
   do web e da API estão mapeadas (`"3002:3002"`, `"8010:8010"`). Se estiverem, o
   `cloudflared` roda no **host WSL2** apontando pra `localhost:<porta>`. Se não,
   rodaria dentro do container.
2. **CORS da API** aceita origem configurável. Na platform API isso é
   `CORS_ORIGINS` (`bff-jboot-platform/src/config/app-config.service.ts`), default só
   `localhost:3000-3002`. A origem do túnel **web** precisa entrar aí, senão o `fetch`
   do celular toma bloqueio de CORS.
3. **Base da API no front** vem de env `NEXT_PUBLIC_*` (ex.
   `NEXT_PUBLIC_JBOOT_PDV_API_URL`), com fallback `http://localhost:8010`.

---

## Passo a passo (parametrizado)

Convenções: `WEB_PORT` (ex. 3002), `API_PORT` (ex. 8010). Ajuste para a feature.

### 1. Instalar cloudflared (uma vez)
```bash
mkdir -p ~/bin
curl -fsSL -o ~/bin/cloudflared \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/bin/cloudflared
~/bin/cloudflared version
```

### 2. Subir os dois túneis e coletar as URLs
Rodar no **host WSL2** (não no container), em background:
```bash
nohup ~/bin/cloudflared tunnel --url http://localhost:8010 --no-autoupdate > /tmp/cf-api.log 2>&1 &
nohup ~/bin/cloudflared tunnel --url http://localhost:3002 --no-autoupdate > /tmp/cf-web.log 2>&1 &
# aguardar ~10-15s e extrair:
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cf-api.log | head -1   # API_URL
grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" /tmp/cf-web.log | head -1   # WEB_URL
```
Subir os dois **antes** de configurar resolve o ovo-e-galinha: `API_URL` vai pro env
do web, `WEB_URL` vai pro CORS da API.

### 3. Apontar o front para a API do túnel
Criar `implementations/app-jboot-next-platform/.env.development.local` (arquivo
**temporário**, lido pelo `next dev`, apagável depois):
```
NEXT_PUBLIC_JBOOT_PDV_API_URL=<API_URL>
```

### 4. Liberar o CORS e reiniciar os dois processos de dev
Os processos sobem via `tools/code-up.sh` (`docker compose exec jboot` + `nohup`, env
inline). Para injetar env nova é preciso **matar e resubir**.

Matar a API atual (dentro do container):
```bash
docker compose exec -T jboot bash -lc "pkill -f 'bff-jboot-platform/node_modules/.bin/nest'; pkill -f 'bff-jboot-platform/dist/main'"
```
Resubir a API com `CORS_ORIGINS` incluindo a `WEB_URL` (mantendo as demais envs do
`code-up.sh`):
```bash
docker compose exec -T jboot bash -lc "cd /workspace && nohup bash -lc \"cd implementations/bff-jboot-platform && PORT=8010 CORS_ORIGINS='http://localhost:3002,http://127.0.0.1:3002,<WEB_URL>' JBOOT_PDV_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_pdv JBOOT_JURIDICO_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_juridico_advocacia_dev JBOOT_KANBAN_DATABASE_URL=postgresql://jboot:jboot@postgres:5432/jboot_kanban_demo_dev JBOOT_FISCAL_SERVICE_URL=http://jboot-fiscal:8090 npm run start:dev\" </dev/null > /tmp/jboot-code-platform-api.log 2>&1 &"
```
(Re)subir o web — lê o `.env.development.local` sozinho:
```bash
docker compose exec -T jboot bash -lc "cd /workspace && nohup bash -lc 'cd implementations/app-jboot-next-platform && npm run dev' </dev/null > /tmp/jboot-code-platform-web.log 2>&1 &"
```
Esperar: API responde `/health` 200 em ~2s; `next dev` compila a primeira rota em
~20s.

### 5. Montar a URL do dispositivo (sem arrastar o Identity)
A página **pública** (ex. `/comanda/<token>`) não exige login e só fala com a API.
Evite abrir o **admin** pelo túnel (isso puxaria o Identity/8000, com CORS e cookies).
Em vez disso, obtenha o token/identificador que a URL pública precisa e monte
`https://<WEB_URL>/<rota-publica>/<token>` você mesmo.

No caso da comanda, o `qrToken` (JWT de mesa, **sem expiração**) sai do endpoint admin
`GET /pdv/comanda-mesas`. Padrão de login dev de duas fases (Operador Senior, senha de
dev `Jboot@123`):
```bash
docker compose exec -T jboot bash -lc '
RESP=$(curl -s -X POST http://localhost:8000/auth/login -H "content-type: application/json" -d "{\"document\":\"00000000191\",\"password\":\"Jboot@123\"}")
TICKET=$(echo "$RESP" | node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>console.log(JSON.parse(d).loginTicket))")
read CID AID <<< $(echo "$RESP" | node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{const j=JSON.parse(d);const x=j.destinations.find(z=>z.applicationSlug===\"pdv\");console.log(x.clientId,x.applicationId)})")
CTX=$(curl -s -X POST http://localhost:8000/auth/context -H "content-type: application/json" -d "{\"loginTicket\":\"$TICKET\",\"clientId\":\"$CID\",\"applicationId\":\"$AID\"}")
TOKEN=$(echo "$CTX" | node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>console.log(JSON.parse(d).accessToken))")
curl -s http://localhost:8010/pdv/comanda-mesas -H "authorization: Bearer $TOKEN" | node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{const j=JSON.parse(d);const rows=Array.isArray(j)?j:(j.data||j.rows||[]);const m=rows.find(r=>r.tableNumber===1)||rows[0];console.log(\"QRTOKEN=\"+m.qrToken)})"
'
```

### 6. Gerar um QR escaneável no terminal
O pacote `qrcode` já existe no `node_modules` do web:
```bash
docker compose exec -T jboot bash -lc 'cd implementations/app-jboot-next-platform && node -e "
const QR=require(\"qrcode\");
const url=\"https://<WEB_URL>/comanda/<QRTOKEN>\";
QR.toString(url,{type:\"terminal\",small:true},(e,s)=>{if(e)throw e;console.log(s)});
"'
```
Aponte a câmera do celular para o QR impresso no terminal. (Ou só abra a URL no celular.)

---

## Verificação (ponta a ponta)
```bash
curl -s -o /dev/null -w "%{http_code}\n" <API_URL>/health                 # 200
curl -s <API_URL>/<endpoint-publico-de-dados>                             # dados esperados
curl -s -D - -o /dev/null -H "Origin: <WEB_URL>" <API_URL>/<endpoint> \
  | grep -i access-control-allow-origin                                   # deve ecoar <WEB_URL>
curl -s -o /dev/null -w "%{http_code}\n" "<WEB_URL>/<rota-publica>/<token>"  # 200
```
No celular: a página abre e **carrega os dados** (não fica em estado vazio/erro).

## Troubleshooting
- **Cardápio/dados vazios no celular, mas o `curl` do endpoint traz dados** → CORS: a
  `WEB_URL` não entrou em `CORS_ORIGINS`, ou a API não foi reiniciada com a env. Ver
  console do navegador do celular e o log da API.
- **`Failed to fetch` sem erro de CORS** → o `NEXT_PUBLIC_*` não foi relido: confirme o
  `.env.development.local` e **reinicie o `next dev`** (env de build só entra no restart).
- **Web dá 000/Connection reset** → o processo `next dev -p 3002` caiu; resubir (passo 4).
- **Suspeito secundário**: CSP com `connect-src` restritivo no web bloquearia o fetch pra
  `API_URL`. Não observado no template atual; checar só se CORS estiver ok e ainda falhar.

## Limpeza ao terminar
```bash
pkill -f 'cloudflared tunnel'                                             # derruba os túneis
rm -f implementations/app-jboot-next-platform/.env.development.local      # remove env de teste
# reiniciar web/api sem as envs extras, ou:
make code-up TARGET=platform
```

---

## Exemplo concreto já testado (2026-08-24, comanda)

Valores **efêmeros** (túneis já derrubados; servem só de referência do formato):

- `API_URL` = `https://well-several-cage-gsm.trycloudflare.com` → `localhost:8010`
- `WEB_URL` = `https://player-organic-matthew-eclipse.trycloudflare.com` → `localhost:3002`
- Cliente dev: **JBOOT LTDA** `a9d9b269-ed83-4496-a5ab-b580fce08ad0`
  (capability `comanda` habilitada, 6 mesas ativas, produto **calabrezo** visível).
- Rota pública: `GET /catalog/public/menu/:clientId` (só fala com a API; lê a capability
  `comanda` em `jboot_identity.client_capabilities` — ver ADR 008).
- URL final da Mesa 1: `https://<WEB_URL>/comanda/<qrToken>`.

Resultados: `/health` 200, menu via túnel retornou `calabrezo`, CORS ecoou a `WEB_URL`,
`/comanda/<token>` 200. QR gerado no terminal e escaneável.

Detalhe de ambiente: o produto **Coquetel Molotov** existe só em **produção**
(`jboot_pdv` de prod, cliente JBOOT `e14d2159-...`); o dev tem `calabrezo`. Bancos
distintos.
