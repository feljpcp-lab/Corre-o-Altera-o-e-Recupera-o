# FELJ Industrial ERP

Plataforma industrial FELJ baseada em GitHub + Supabase/PostgreSQL.

## Arquitetura
- Frontend web: HTML/CSS/JavaScript modular, preparado para evolução para React/Next.js.
- Backend: Supabase.
- Banco: PostgreSQL 17.
- Auth: Supabase Auth.
- Segurança: RLS + perfis/RBAC + funções transacionais.
- Storage: Supabase Storage para documentos, desenhos, certificados e fotos.
- Edge Functions: processos server-side.
- CI: GitHub Actions para validação de sintaxe.

## Núcleo industrial
Comercial → Engenharia → OS → Componentes → Roteiros → Material/H13 → Estoque → PCP/APS → MES → Tratamento térmico → Calibração → Erosão → Qualidade → Custos → Faturamento → Expedição.

## Módulos
Comercial, Engenharia, OS 360°, PCP/APS, Produção, Estoque e rastreabilidade, Qualidade/Metrologia/CAPA, Compras, Manutenção, Custos, Faturamento, Expedição, Notificações e Correções.

## Acesso
O ponto de entrada é `erp.html`. O aplicativo legado de Correções permanece em `app.html`.

O projeto usa uma chave **publishable** no navegador; chaves secretas/service-role nunca devem ser colocadas no frontend.

## Supabase
Projeto: `jklgvpmgvkooghfhnirq`.

As tabelas expostas possuem RLS. O banco inclui funções transacionais para:
- reserva de material;
- finalização de operação;
- criação de OS a partir de orçamento aprovado.

A Edge Function `erp-health` valida sessão e conectividade com o banco.

## Dados iniciais
Máquinas, motivos de parada, estoques, roteiros padrão e a extrusora conhecida `IMPERIO ALUMINIO` foram cadastrados. A lista nominal completa de extrusoras deve ser importada quando o arquivo-fonte oficial estiver disponível; nomes não devem ser inventados.

## Regra de desenvolvimento
Alterações estruturais futuras devem ser feitas por migrations versionadas. Nunca colocar secrets no GitHub.
