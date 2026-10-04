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
3. A LAYA analisa os dados e sugere uma categoria, um setor responsável e uma prioridade baixa, normal, alta ou crítica.
4. A sugestão segue para revisão humana, que pode confirmar ou corrigir a classificação antes do encaminhamento.
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
  "prioridade": "alta",
  "confianca": 0.82,
  "revisao_humana": true,
  "provedor": "laya"
}
```

## Decisões e revisão humana

A triagem e a revisão humana consideram:

- **Classificação:** identifica a categoria da solicitação, como manutenção, saúde, transporte, compras, administrativo ou outros.
- **Prioridade:** classifica cada solicitação como baixa, normal, alta ou crítica para ordenar a fila de atendimento.
- **Regra operacional:** estoque registrado em zero junto a um atendimento, consulta ou procedimento previsto para hoje eleva a prioridade para alta, caso a sugestão seja baixa ou normal.
- **Revisão humana:** toda sugestão pode ser conferida e alterada por uma pessoa responsável antes do encaminhamento.

Uma pessoa responsável poderá revisar uma solicitação e confirmar ou corrigir a classificação. Tanto as decisões automáticas quanto as alterações humanas devem compor o histórico da solicitação.

## Informações armazenadas

O MongoDB será o banco de dados principal. A estrutura de documentos permite guardar dados relacionados em objetos aninhados, listas e históricos. Entre as informações previstas estão:

- unidades e sua localização;
- materiais e dados de estoque;
- solicitações, com unidade, material, quantidade, motivo, data e status;
- classificação, setor, prioridade, confiança e necessidade de revisão;
- histórico das decisões tomadas.

## Acompanhamento

O sistema permite acompanhar solicitações recentes, pedidos em andamento, solicitações de prioridade alta ou crítica, revisões pendentes e pedidos concluídos. A visão geral também resume as solicitações por categoria.

## API e tecnologias

- **Frontend:** React, com Vite e Vitest para desenvolvimento e testes.
- **Backend:** Python e FastAPI, responsáveis pela API REST e validação das requisições.
- **Banco de dados:** MongoDB para solicitações, cadastros e histórico.
- **Camada de decisão:** LAYA, usada para sugerir categoria, setor e faixa de prioridade; a decisão permanece sujeita à revisão humana.

A API fará a ligação entre a interface, o banco de dados e a camada de decisão. A documentação dos endpoints fica disponível pelo OpenAPI do FastAPI durante a execução da aplicação.

## Escopo previsto

A aplicação permite cadastrar, consultar, editar e excluir unidades, materiais e posições de estoque. Solicitações também podem ser registradas, consultadas, editadas e excluídas; quando seus dados de classificação mudam, a triagem é refeita e o pedido volta para revisão humana. Materiais ou unidades vinculados a solicitações ou ao estoque não podem ser excluídos para preservar esses vínculos. O histórico das decisões é mantido junto ao fluxo da solicitação.
