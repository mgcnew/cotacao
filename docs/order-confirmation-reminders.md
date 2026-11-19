# Confirmação de pedidos pelo WhatsApp

A mensagem inicial mostra empresa, número do pedido, quantidade de produtos,
prazo de entrega e o link de confirmação. Os produtos e valores ficam na página
do pedido. Modelos personalizados antigos com `{itens}` passam a mostrar a
contagem, e a mensagem sempre mantém um link e o prazo de uma hora.

O lembrete é único por revisão e vai ao contato usado no envio inicial pela
integração Evolution. O prazo começa quando a integração aceita o envio, pois
nem todos os contatos fornecem confirmação de entrega. Envios manuais não
agendam uma cobrança automática. A fila começa com os novos envios após a
migration; pedidos anteriores não recebem lembretes retroativos.

Pedidos confirmados, contestados, cancelados ou com a revisão substituída não
recebem cobrança. O lembrete não cancela o pedido nem impede confirmação após o
prazo. A tela do pedido mostra atraso e resultado do lembrete ao ser atualizada.

## Ativação em produção (Vercel Hobby)

O cron da Vercel Hobby não atende à frequência necessária. Usamos o agendador
do próprio Supabase com `pg_cron`, `pg_net` e Vault:

1. Aplique `supabase/migrations/0133_order_confirmation_reminders.sql` pelo fluxo
   de migrations do projeto e publique o código da aplicação.
2. Confira que `CRON_SECRET` está configurado na Vercel, junto das credenciais
   Supabase e Evolution já usadas pelo envio de pedidos. Use um segredo longo
   e aleatório. Não use a chave service role como segredo do cron.
3. No Vault do Supabase, crie `order_reminders_app_url` com a URL pública de
   produção e `order_reminders_cron_secret` com o mesmo valor de `CRON_SECRET`.
4. Execute `supabase/scripts/schedule-order-confirmation-reminders.sql` no SQL
   Editor do Supabase. O script pode ser repetido para atualizar o mesmo job.
5. Confira o job `order-confirmation-reminders` no painel Cron e seu histórico.

O job verifica a fila a cada minuto, de segunda a sexta, das 8h às 18h no fuso
`America/Sao_Paulo`. Um prazo que vence fora desse intervalo fica para o próximo
horário permitido. Feriados não são excluídos. A rota protegida é
`GET /api/orders/confirmation-reminders` e exige `Authorization: Bearer CRON_SECRET`.
Não há alteração nos jobs diários já existentes em `vercel.json`.

## Falhas e acompanhamento

Cada execução reserva até dez registros no banco com `FOR UPDATE SKIP LOCKED`.
Execuções simultâneas não cobram a mesma revisão. Uma nova verificação do estado
do pedido é feita antes de enviar, e a comunicação fica no histórico.

Uma desconexão conhecida antes do envio mantém o lembrete pendente. Falhas ou
interrupções após reservar o envio ficam visíveis, sem repetição automática:
um timeout pode significar que o WhatsApp aceitou a mensagem. Confira a conversa
antes de cobrar manualmente. Reservas interrompidas são marcadas como falha após
dez minutos na próxima execução. Como em todo envio externo, ainda existe uma
pequena janela entre a última leitura do pedido e a chamada ao provedor.

Para pausar: `select cron.unschedule('order-confirmation-reminders');`.

Referências:
- https://supabase.com/docs/guides/functions/schedule-functions
- https://vercel.com/docs/cron-jobs/usage-and-pricing
