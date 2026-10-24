# MealSwiss — aplicação Android (React Native + Expo)

Este pacote contém **código-fonte de uma aplicação Android real**, NÃO é HTML e NÃO é um APK compilado.

## Incluído nesta versão
- Ecrãs nativos: início, receitas e detalhes, plano semanal, despensa, compras, comparador, histórico, despesas, marmitas, cozinheiros, talões, amigos e perfil.
- Despensa com quantidades editáveis e persistência local; desconta ingredientes **apenas quando confirmas que cozinhaste**.
- Lista de compras interativa, reposição na despensa, plano semanal e pesquisa de receitas.
- Identidade MealSwiss verde/laranja, fotografias de referência e ícone.

## Limites importantes
- Preços, tendências, despesas e perfis de cozinheiros são **dados demonstrativos**.
- Não há IA a recolher preços diariamente; requer backend, fontes de preços autorizadas, infraestrutura e testes.
- Não existem contas online, pagamentos, encomendas, leitura automática de talões ou notificações.
- Ainda não foi testado em Android real nem submetido à Google Play.

## Compilar APK no Expo EAS
1. Criar conta em https://expo.dev e repositório do projeto num ambiente com Node.js.
2. Executar `npm install` e `npx eas-cli login`.
3. Executar `npx eas-cli build:configure` (configura projeto EAS e ID real).
4. APK de teste: `npx eas-cli build --platform android --profile preview`.
5. AAB Google Play: `npx eas-cli build --platform android --profile production`.

A compilação EAS necessita de conta Expo e acesso à internet; não é realizada automaticamente com este ZIP.

## Antes de publicar
Verificar direitos das imagens e logótipo, implementar política de privacidade, validar fluxos, melhorar acessibilidade, obter fontes legais de preços, configurar infraestrutura e cumprir requisitos de testes da Google Play.
