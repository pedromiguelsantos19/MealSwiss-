# MealSwiss — Aplicação Android v4.0 (atualização para Codespaces)

Projeto React Native / Expo SDK 54, desenvolvido para Android, com painel administrativo Node 20+ incluído na pasta `backend`.

**Estado:** base nativa funcional e compilável em princípio, mas AINDA NÃO certificada em APK neste pacote. A compilação Android deve ser executada no Expo EAS, com testes no dispositivo depois. Não anunciar funcionalidades externas como prontas antes de ativar os respetivos contratos e serviços.

## 1. O que já funciona sem servidor

- Design móvel de referência: fundo branco, marca verde/laranja, ícones, fotos culinárias, categorias, cartões e barra inferior posicionada **acima da navegação do Android** via `react-native-safe-area-context`.
- 40 receitas integradas (valores de ingredientes; **sem custos fictícios em CHF**), pesquisa, favoritos e filtros por tipo/equipamento.
- Seleção dos equipamentos disponíveis (fogão, forno, air fryer e micro-ondas), com filtragem de receitas.
- Despensa editável, quantidades, unidades, alertas de stock baixo e armazenamento local.
- Visualização dos ingredientes em falta, adição à lista de compras e subtração da despensa **apenas após confirmação da preparação**.
- Lista de compras, marcar compras feitas, repor stock da despensa; plano semanal com receitas; sugestões locais baseadas no stock; marmitas.
- Registo manual de despesas, fotografia local de talão, partilha do MealSwiss.
- Navegação funcional por secções, com ecrãs preparados para integração de preços e marketplace.

## 2. O que depende de serviços comerciais/externos

| Funcionalidade | Estado | Dependências |
|---|---|---|
| IA para gerar receitas novas | API implementada no servidor; **inativa sem chave** | `OPENAI_API_KEY`, alojamento do backend, `EXPO_PUBLIC_API_URL` |
| Preços reais de Coop, Migros, Denner, Lidl e Aldi | Modelo de dados + motor de recolha diária implementados; **sem dados inventados** | autorização/condições de utilização, fontes oficiais configuradas no admin, acessibilidade de preços JSON-LD, servidor online |
| Histórico e destaque de preços do dia | Interface ligada à API; apresenta indisponível se faltar fonte | recolhas verificadas com data e URL |
| Back-office | Painel com login e CRUD operacional em Node | alojar backend com HTTPS, definir credenciais fortes, armazenamento persistente |
| Cozinheiros e produtos patrocinados | API e painel prontos, apresentação de perfis verificados na app | onboarding e validação humana, revisão legal |
| Pagamentos TWINT | Integração opcional de checkout Stripe TWINT/Connect + webhook com assinatura, **DESATIVADA** | conta comercial, elegibilidade TWINT, Stripe Connect, contas de cozinheiros verificadas e chaves privadas |
| Publicidade Google | Gestão de identificadores de slots no admin | conta Google AdMob aprovada, SDK, consentimento de privacidade e configuração de anúncios |
| OCR de talões | Fotografia e registo manual apenas | fornecedor OCR autorizado + infraestrutura segura |
| Utilizadores online | Registos de gestão administrativa apenas | autenticação de utilizadores e proteção de dados ainda por desenvolver |

**Importante:** o servidor incluído é uma base funcional e não substitui uma auditoria de segurança, proteção de dados nem a conformidade alimentar e fiscal para vendas de refeições na Suíça. A app não processa pagamentos sem ativação explícita do PSP.

## 3. Criar APK pela tua conta Expo (telemóvel Android)

Já existe no Expo o projeto `MealSwiss` da conta `mealswiss2027s-team`, com Project ID `3b6373ea-c50f-460a-b08b-016cf67d929f`. O código está no GitHub `pedromiguelsantos19/MealSwiss-`.

1. Substitui no **raiz** do repositório os ficheiros `App.js`, `package.json`, `app.json`, `babel.config.js`, `eas.json` desta versão. Também existe uma ZIP menor `MealSwiss_Atualizacao_GitHub.zip` que contém só os ficheiros necessários para compilar o app.
2. Na pasta `assets` do GitHub, adiciona `logo-mark.png`, `airfryer.jpg`, `food6.jpg` e `alpes.jpg` (ou carrega todos os assets desta versão para os atualizar). **A pasta `assets` deve manter esse nome**.
3. Na pasta `.eas/workflows` do repositório conserva o workflow `build-apk.yml` já funcional ou substitui-o pelo deste pacote, mantendo **sem espaços** em `.eas/workflows`.
4. Confirma no GitHub que o commit mostra os novos ficheiros (o `App.js` antigo tinha uma barra inferior sem safe area).
5. No Expo > projeto MealSwiss > Workflows > Run workflow, escreve `main` e clica **Load** > `build-apk.yml` > **Confirm**.
6. Após **Succeeded**, abre `build_android`, descarrega o novo `.apk` e instala-o no Android. Reinstalar pode manter dados locais (salvos com a chave `mealswiss.local.v2`).
7. Testa o ecrã inicial, barra inferior, equipamento, stock, receitas, plano e compras. O AAB da Google Play só deve ser gerado após testes e revisão de privacidade.

**Não se pode simplesmente renomear um ZIP para `.apk`**. Este ambiente não tem Android SDK/EAS autenticado, pelo que a construção binária terá de ocorrer no teu Expo.

## 4. Servidor + back-office

```bash
cd backend
cp .env.example .env
# Preenche as variáveis com segredos privados no serviço de alojamento, não no GitHub!
export ADMIN_PASSWORD='uma-palavra-passe-longa-e-unica'
export COOKIE_SECRET='chave-secreta-muito-comprida-e-aleatoria'
export PUBLIC_BASE_URL='https://o-teu-dominio-backend.ch'
export PORT=8080
export AUTO_REFRESH_PRICES=true
node server.mjs
```

Depois: `https://o-teu-dominio-backend.ch/admin`.

- `ADMIN_PASSWORD` precisa de 12+ caracteres e `COOKIE_SECRET` de 24+.
- `DB_FILE` deve apontar para um **volume persistente** em produção. Os JSON locais de testes não são adequados a grande escala.
- Configura **HTTPS obrigatório**, backups, retenção de dados e serviços de autenticação antes de permitir utilizadores reais.
- Preenche `EXPO_PUBLIC_API_URL=https://o-teu-dominio-backend.ch` nas variáveis EAS do projeto e faz **outra compilação APK** para ligar a app ao servidor. Nunca incluas no APK chaves secretas.

### Preços reais diários

Adiciona `products` e respetivas `priceSources` no admin. Uma fonte indica supermercado, URL do **produto concreto**, identidade, e estado/autorizações confirmadas. O motor só aceita sites oficiais das cinco cadeias, URL HTTPS e metadados de preço `application/ld+json` em CHF associados ao mesmo produto. Recolhe ao iniciar quando `AUTO_REFRESH_PRICES=true`, repete a cada 24 horas e regista data + URL. Não garante que todas as lojas forneçam JSON-LD nem que aceitem recolha automatizada. Para cobertura completa podem ser necessários feeds/licenças/integrações comerciais. **Não ativar fontes se as condições de utilização não o permitirem.**

### TWINT / pagamentos de cozinheiros

Ativação **apenas quando existirem**: fornecedor PSP compatível com TWINT, conta Stripe/TWINT elegível, contas Stripe Connect dos cozinheiros, `MARKETPLACE_READY=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_BASE_URL` público HTTPS, verificação das regras de venda de alimentos e termos comerciais.

- O cliente abre um checkout externo (TWINT) e os dados sensíveis não são introduzidos no APK.
- O estado só se torna **paid** quando o backend recebe webhook Stripe válido e confirma valor/moeda/encomenda.
- Um redirecionamento de sucesso **não** prova pagamento; rejeitam-se confirmações sem assinatura.
- Reembolsos e pagamentos a cozinheiros precisam de procedimentos legais/operacionais adicionais.

## 5. Segurança, privacidade e publicidade

A versão atual usa dados guardados no dispositivo. Para lançamento com contas reais, localização, leitura de talões e marketplace são essenciais autenticação profissional, políticas GDPR/nLPD suíça, proteção contra abuso, política de privacidade, consentimento e segurança alimentar. Os banners patrocinados são identificados como tal. O SDK Google AdMob ainda não foi integrado porque não existem IDs aprovados nem consentimento.

## 6. Verificações feitas neste ambiente

- O código JSX foi validado com o parser TypeScript e não apresentou erros de sintaxe; o visual foi comparado com os mockups, mas **não houve validação visual num dispositivo real**.
- O servidor Node foi validado com `node --check` e testado com autenticação, API de preços sem dados inventados e criação administrativa de produto.
- **Não foram efetuados testes num emulador nem produzidos binários APK neste ambiente.**

Documentação oficial: https://docs.expo.dev/eas/workflows/ | https://www.twint.ch/en/business-customers/ | https://docs.stripe.com/payments/twint


## Atualização pelo Codespaces no Android

Usa o pacote `MealSwiss_Codespaces_Atualizacao.zip` na raiz do repositório, depois executa o comando indicado na mensagem do ChatGPT. O script valida os caminhos, copia as alterações e faz commit/push na branch main sem exigir carregamento individual de imagens. Não faz deploy automático do backend ou pagamentos.

## V4 — critérios de fidelidade aos mockups aprovados

- **Boas-vindas:** símbolo original da montanha/folha/panela, nome verde e laranja, Alpes em fundo, botão verde e texto de entrada.
- **Início:** marca no cabeçalho, saudação e pesquisa, 4 atalhos em tons pastel, anúncio fotográfico air fryer, sugestões em 3 cartões fotográficos e bloco «Queres que cozinhe para ti?».
- **Receitas:** pesquisa, filtros e grelha de 2 colunas com fotos; sem preços inventados.
- **Despensa:** linhas brancas separadas, estado verde/amarelo/vermelho, quantidades e controlos.
- **Compras / Plano:** listas editáveis e navegação nativa Android.
- **Android:** barra inferior separada dos botões do sistema usando `useSafeAreaInsets`.
- **Ícone:** laranja `#FF7900` e figura branca.

**Nota técnica:** os desenhos são reconstruídos em componentes reais React Native, não são capturas apresentadas como páginas. A identidade visual foi seguida no código, mas **não se garante reprodução pixel a pixel sem comparar capturas do novo APK no dispositivo**.

Esta atualização altera a versão para `4.0.0`, `android.versionCode=5`, sem apagar os dados guardados no dispositivo.
