# Imagens de referência e planejamento

Abra `/projects`, entre em um projeto e use a aba **Imagens**. Envie PNG, JPEG ou WebP e indique se a imagem representa o **layout desejado** ou uma **captura do resultado atual**. O envio salva uma referência normalizada; não inicia uma chamada de IA nem inclui automaticamente a imagem no aplicativo gerado.

Marque as imagens que deverão acompanhar o próximo pedido (até quatro). No formulário, escolha um modelo que realmente aceite imagens, confirme esse suporte e autorize o envio do contexto. A confirmação de suporte é uma declaração do operador, não uma certificação técnica. O teste de texto/streaming de `/settings/ai` também não comprova visão. Modelos incompatíveis podem recusar a solicitação; o sistema não troca de provedor nem omite imagens silenciosamente.

A IA recebe as imagens normalizadas como partes multimodais, juntamente com os arquivos do projeto e os papéis das referências. A orientação visual considera composição, espaçamento, tipografia, cores e proporções. O código continua sendo uma proposta: deve compilar e ser aprovado antes de substituir a revisão salva. O sistema não usa a imagem inteira como substituto de uma interface funcional.

Na aba **Prévia**, selecione **Comparar com referência** para examinar a imagem escolhida e o aplicativo lado a lado. Em telas pequenas os painéis ficam empilhados. A largura da prévia pode ser adaptável, 390, 820 ou 1440 pixels; larguras maiores que o espaço disponível têm rolagem interna. A comparação é manual: não há uma pontuação automática de fidelidade ou certificação de acessibilidade.

## Planejar antes de construir

Escolha **Planejar sem alterar arquivos**, descreva o pedido e autorize a chamada ao modelo. O plano é salvo na conversa e na aba **Plano**, sem criar uma revisão de código. Mesmo uma resposta que contenha blocos de arquivo é apenas texto nesse modo. Planejar pode consumir tokens, mas não executa ferramentas, arquivos ou deployments.

**Usar plano em nova solicitação** copia o plano para o campo do pedido e seleciona o modo de construção; não envia automaticamente uma segunda chamada. Revise o texto, as imagens selecionadas e a autorização. Se a revisão do projeto mudou, solicite um plano atualizado. Este modo não oferece toda a investigação por agentes nem o editor de planos versionados do Lovable.

## Segurança e armazenamento

- Apenas rasters PNG/JPEG/WebP são aceitos; não se baixam URLs nem se executa SVG.
- Limites: entrada de 5 MiB, até 20 milhões de pixels, lados até 8192 pixels, saída normalizada até 3 MiB, seleção de até quatro imagens e 6 MiB normalizados por pedido.
- As imagens são reencodadas sem EXIF/perfis e redimensionadas proporcionalmente para caber em 2048 × 4096 quando necessário. Portanto, não preservam os bytes originais nem garantem igualdade pixel a pixel.
- O projeto armazena até 32 imagens / 32 MiB, incluindo referências arquivadas. Arquivar remove da seleção, não apaga evidências usadas em execuções anteriores.
- IDs, papéis e hashes estão vinculados à execução. Um pedido repetido com a mesma chave e imagens diferentes é rejeitado.
- As referências ficam no SQLite, separadas dos arquivos do aplicativo, e não são incluídas automaticamente na exportação ZIP de código. Inclua o banco em seu backup consistente.
- O processamento não detecta nem oculta segredos, rostos ou dados pessoais visíveis nos pixels. Revise e recorte a captura antes do envio. Use somente imagens autorizadas.

Nenhum modelo externo foi homologado pelos testes de contrato locais. Fidelidade visual real depende do modelo, da referência e da revisão do resultado. Estes recursos não entregam toda a paridade com a plataforma Lovable; consulte `lovable-functional-parity.md`.
