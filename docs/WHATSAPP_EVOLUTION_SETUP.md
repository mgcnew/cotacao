# WhatsApp Compras — ativação da Evolution

O módulo cria uma instância isolada da Evolution para cada empresa. A Evolution
nunca é chamada pelo navegador: chave e segredo ficam somente no servidor. O
administrador da empresa conecta e reconecta o próprio número por QR Code nas
Configurações, sem acessar o Evolution Manager.

## 1. Banco

Aplique no SQL Editor do Supabase, na ordem das migrations existentes:

`supabase/migrations/0042_whatsapp_procurement_inbox.sql`

`supabase/migrations/0047_whatsapp_connection_per_company.sql`

Elas criam as quatro tabelas, RLS, índices de idempotência, publicação Realtime
e garantem uma conexão por empresa.

## 2. Ambiente da aplicação

Configure no ambiente local e na hospedagem:

```dotenv
EVOLUTION_API_URL=https://evolution.seu-dominio.com
EVOLUTION_API_KEY=sua-chave
EVOLUTION_WEBHOOK_SECRET=um-segredo-aleatorio-com-pelo-menos-24-caracteres
CRON_SECRET=outro-segredo-aleatorio
NEXT_PUBLIC_APP_URL=https://app.seu-dominio.com
```

Para gerar os segredos:

```bash
openssl rand -hex 32
```

Não use `localhost` em `NEXT_PUBLIC_APP_URL` na produção: a Evolution precisa
alcançar `https://app.seu-dominio.com/api/evolution/webhook`.

## 3. Ativação

Depois do deploy e do SQL:

1. Abra **Configurações > WhatsApp** com um usuário administrador.
2. Clique em **Conectar WhatsApp**.
3. O servidor cria uma instância exclusiva, configura o webhook com um header
   secreto e devolve somente a imagem do QR Code para a tela.
4. No celular, abra **Aparelhos conectados > Conectar um aparelho** e leia o
   código. A tela verifica automaticamente até confirmar a conexão.

Quando uma sessão expirar, o mesmo administrador usa **Reconectar** e lê um novo
QR Code. A instância e o histórico do sistema são preservados.

São habilitados somente os eventos necessários:

- `MESSAGES_UPSERT`
- `MESSAGES_UPDATE`
- `MESSAGES_DELETE`
- `SEND_MESSAGE`
- `SEND_MESSAGE_UPDATE`
- `CONNECTION_UPDATE`

`byEvents` e `base64` ficam desligados. A ausência de base64 evita payloads
pesados; mídia será buscada e armazenada de forma controlada numa etapa própria.

Se a Evolution instalada usar um contrato antigo e rejeitar a configuração
automática, verifique a versão antes de adaptar o payload. Não atualize a imagem
da VPS usando a tag `latest` sem homologação.

## 4. Reconciliação de segurança

O webhook é a via rápida. Para recuperar mensagens durante indisponibilidades,
agende a cada cinco minutos, na VPS ou no provedor de cron:

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer SEU_CRON_SECRET" \
  https://app.seu-dominio.com/api/evolution/reconcile
```

O endpoint atualiza primeiro o estado das conexões e, para as conectadas,
consulta a janela recente de mensagens. Mensagens já existentes são ignoradas
pelo par `connection_id + external_message_id`.

## 5. Verificação de aceite

- **Configurações > WhatsApp** gera o QR Code sem abrir o Evolution Manager.
- O indicador da tela mostra **Conectado** e o número conectado.
- Uma mensagem enviada pelo sistema aparece na mesma conversa do celular.
- Uma mensagem recebida aparece sem recarregar a página.
- Entregue e lida atualizam o ícone da mensagem.
- Mensagem repetida pelo webhook não cria duplicata.
- Um número cadastrado é associado automaticamente ao fornecedor.
- Um número desconhecido fica em triagem e pode ser vinculado manualmente.
- Desligar a Evolution apresenta o bloqueio no compositor, sem perder histórico.

## Limites desta primeira entrega

Texto está completo. Imagem, documento, áudio e vídeo recebidos já são
classificados e aparecem na linha do tempo, mas o download/armazenamento privado
do arquivo e o envio de anexos devem ser homologados contra a versão real da
Evolution antes de serem habilitados.
