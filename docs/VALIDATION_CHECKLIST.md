# Checklist de validação antes do frontend

## Banco

- [ ] `supabase db reset` executa todas as migrations 0001–0017 sem erro.
- [ ] `supabase test db` executa os testes pgTAP.
- [ ] Security Advisor não acusa tabela pública sem RLS.
- [ ] Performance Advisor é revisado após dados de teste.

## Multiempresa

Criar duas empresas de teste A e B e dois usuários.

- [ ] Usuário A enxerga somente dados da Empresa A.
- [ ] Usuário B enxerga somente dados da Empresa B.
- [ ] Alterar `company_id` no payload não atravessa tenant.
- [ ] FK composta bloqueia relações A → B mesmo usando service/backend incorretamente.

## Papéis

- [ ] Administrador executa todas as ações da empresa.
- [ ] Comprador cria Rodada, negocia, fecha e cria pedido.
- [ ] Recebimento registra entrega, mas não registra negociação.
- [ ] Consulta não executa mutações.
- [ ] Override `deny` vence permissão do papel.
- [ ] Override `allow` adiciona permissão ausente no papel.

## Cotação

- [ ] Um fornecedor recebe somente os itens atribuídos.
- [ ] Um token de fornecedor A não abre fornecedor B.
- [ ] Resposta pode ser parcial.
- [ ] Resposta parcial pode ser complementada.
- [ ] Item já respondido não pode ser sobrescrito pelo fornecedor.
- [ ] Correção do comprador gera `response_item_corrections`.
- [ ] Múltiplas negociações preservam todo o histórico.

## Pedido

- [ ] Confirmar alocações gera um pedido por fornecedor.
- [ ] Pedido direto usa as mesmas tabelas de pedido.
- [ ] Revisão enviada é imutável.
- [ ] Nova revisão não apaga a antiga.
- [ ] Token aponta para revisão específica.
- [ ] Confirmação repetida é idempotente.
- [ ] Divergência do fornecedor não altera o pedido automaticamente.

## Recebimento

- [ ] Recebimento só aceita revisão confirmada.
- [ ] Recebimento parcial mantém saldo.
- [ ] Quantidade logística e quantidade de precificação são independentes.
- [ ] Preço diferente do acordado gera divergência comercial.
- [ ] Peso/quantidade variável não é automaticamente tratado como erro.
- [ ] Encerrar saldo preserva as quantidades reais registradas.

## Comunicação

- [ ] Pedido/cotação continuam existindo se Evolution falhar.
- [ ] Falha fica registrada em `communication_logs`.
- [ ] Reenvio não duplica pedido.
- [ ] Token bruto nunca é armazenado no banco; somente SHA-256.
