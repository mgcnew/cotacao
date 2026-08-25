# WhatsApp Compras — ativação da Evolution

O módulo cria uma instância isolada da Evolution para cada empresa. A Evolution
nunca é chamada pelo navegador: chave e segredo ficam somente no servidor. O
administrador da empresa conecta e reconecta o próprio número por QR Code nas
Configurações, sem acessar o Evolution Manager.

## 1. Banco

Aplique no SQL Editor do Supabase, na ordem das migrations existentes:

`supabase/migrations/0042_whatsapp_procurement_inbox.sql`

`supabase/migrations/0047_whatsapp_connection_per_company.sql`

`supabase/migrations/0048_whatsapp_message_kinds.sql`

`supabase/migrations/0049_whatsapp_message_templates.sql`

`supabase/migrations/0050_whatsapp_order_confirmation_template.sql`

`supabase/migrations/0051_whatsapp_metrics.sql`

Elas criam as quatro tabelas, RLS, índices de idempotência, publicação Realtime
e garantem uma conexão por empresa. A última também classifica convites e
cobranças para impedir lembretes repetidos em intervalo curto e permite que
cada empresa personalize os textos enviados.

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

Se as variáveis ou o domínio público mudarem depois da conexão, use
**Reconfigurar integração**. O webhook é instalado novamente sem desconectar o
WhatsApp e, na sequência, o sistema verifica as mensagens recentes.

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

O webhook é a via rápida. O `vercel.json` executa uma recuperação diária às
06:00 UTC, compatível inclusive com o plano Hobby. Como proteção operacional
mais rápida, agende também a cada cinco minutos na VPS:

```bash
curl --fail --silent --show-error \
  -H "Authorization: Bearer SEU_CRON_SECRET" \
  https://app.seu-dominio.com/api/evolution/reconcile
```

O endpoint atualiza primeiro o estado das conexões e, para as conectadas,
consulta a janela recente de mensagens. Mensagens já existentes são ignoradas
pelo par `connection_id + external_message_id`.

Também é possível executar a mesma recuperação imediatamente em
**Configurações > WhatsApp > Sincronizar mensagens**. O painel mostra a data do
último webhook recebido e da última sincronização, facilitando a identificação
de uma integração que envia, mas deixou de receber.

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

Texto e áudio recebido estão completos. Áudios de até 20 MB são buscados na
Evolution, armazenados no bucket privado `whatsapp-media` e reproduzidos por uma
rota que valida a empresa e o usuário antes de entregar o arquivo. Imagem,
documento e vídeo ainda são classificados na linha do tempo, mas o download e o
envio desses anexos continuam pendentes de homologação.
