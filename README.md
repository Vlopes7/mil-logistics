# Mil Logistics

## O que é o projeto

O **Mil Logistics** é um sistema de gestão e triagem de solicitações logísticas, pensado para organizações militares. Unidades podem registrar pedidos de materiais e suprimentos, como peças de manutenção, uniformes, equipamentos, materiais médicos e itens administrativos. O sistema organiza essas solicitações para que possam ser acompanhadas e encaminhadas aos setores responsáveis.

O projeto tem finalidade acadêmica e administrativa e utiliza dados fictícios.

## Problema que o projeto aborda

Quando várias unidades enviam solicitações de diferentes tipos, é necessário entender o que está sendo pedido, definir o grau de prioridade e identificar para qual setor cada pedido deve seguir. Esse trabalho pode ficar difícil de acompanhar quando as informações estão espalhadas ou são classificadas manualmente.

O Mil Logistics propõe centralizar os pedidos e automatizar parte dessa triagem. Solicitações com informações insuficientes ou decisões pouco confiáveis podem ser encaminhadas para análise humana.

## Como vai funcionar

1. Uma unidade registra uma solicitação com o material, a quantidade e o motivo do pedido.
2. A API recebe e armazena a solicitação.
3. Uma camada de decisão analisa os dados e sugere uma categoria, um setor responsável e uma pontuação de prioridade.
4. A camada também indica se a solicitação pode seguir automaticamente ou se precisa de revisão humana.
5. O resultado da decisão é armazenado junto à solicitação, e seu histórico fica registrado.
6. Os usuários acompanham solicitações, prioridades e revisões pelo sistema.

Exemplo de dados enviados:

```json
{
  "unidade": "Unidade Alfa",
  "material": "Filtro de ar",
  "quantidade": 15,
  "motivo": "Manutenção preventiva de veículos"
}
```

Exemplo de resultado da triagem:

```json
{
  "categoria": "manutencao",
  "setor": "almoxarifado",
  "prioridade": 85,
  "confianca": 0.92,
  "revisao_humana": false
}
```

## Decisões e revisão humana

A triagem considera três aspectos:

- **Classificação:** identifica a categoria da solicitação, como manutenção, saúde, transporte, compras, administrativo ou outros.
- **Prioridade:** atribui uma pontuação de 0 a 100 para ajudar a ordenar a fila de atendimento.
- **Verificação:** avalia se há informação suficiente para seguir o fluxo ou se é necessária revisão humana.

Uma pessoa responsável poderá revisar uma solicitação e confirmar ou corrigir a classificação. Tanto as decisões automáticas quanto as alterações humanas devem compor o histórico da solicitação.

## Informações armazenadas

O MongoDB será o banco de dados principal. A estrutura de documentos permite guardar dados relacionados em objetos aninhados, listas e históricos. Entre as informações previstas estão:

- unidades e sua localização;
- materiais e dados de estoque;
- solicitações, com unidade, material, quantidade, motivo, data e status;
- classificação, setor, prioridade, confiança e necessidade de revisão;
- histórico das decisões tomadas.

## Acompanhamento

O sistema prevê uma área de acompanhamento para consultar a fila de solicitações, visualizar prioridades e identificar pedidos que aguardam revisão ou já foram atendidos. Também poderão ser consultados indicadores como solicitações por categoria, unidade e setor, prioridade média e evolução ao longo do tempo.

## API e tecnologias

- **Frontend:** React, com Vite e Vitest para desenvolvimento e testes.
- **Backend:** Python e FastAPI, responsáveis pela API REST e validação das requisições.
- **Banco de dados:** MongoDB para solicitações, cadastros e histórico.
- **Camada de decisão:** Laya ou tecnologia compatível, mantida desacoplada para permitir sua substituição durante o desenvolvimento.

A API fará a ligação entre a interface, o banco de dados e a camada de decisão. A documentação dos endpoints fica disponível pelo OpenAPI do FastAPI durante a execução da aplicação.

## Escopo previsto

A proposta inicial contempla cadastro de unidades e materiais, registro e acompanhamento de solicitações, classificação e priorização, indicação de revisão humana, armazenamento do histórico, consultas e indicadores. Recursos como fornecedores, compras, transporte e controle avançado de estoque podem ser considerados posteriormente.
