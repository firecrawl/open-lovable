# Admissao de codigo e dependencias

Esta ferramenta implementa a decisao de admissao para candidatos explicitamente cadastrados; nao transforma toda a matriz de pesquisa em codigo aprovado.

- `registry.json`: inventario das 59 referencias de pesquisa, sem homologacao nesta execucao.
- `candidates.json`: artefatos selecionados, contendo `manifest` e `sourceDirectory` relativo ao repositorio.
- `approvals.json`: decisoes do revisor, protegidas pela revisao de codigo e pelo processo de merge. Nao receber esse registro de uma API publica ou de uma resposta do modelo.
- `npm run check:admission`: exige uma revisao exata e nao expirada e verifica os bytes reais de cada arquivo e da licenca integral. Entra em `check` e CI.

Cada manifesto fixa SHA de 40 caracteres, caminhos, digests, licenca, dependencias, finalidade e permissoes. Alterar qualquer campo invalida a decisao anterior. Diretorios Pro/Enterprise/comerciais e arquivos de fontes exigem revisao explicita de cada caminho. Falta de licenca ou manutencao conhecida nao e resolvida pelo numero de estrelas do projeto.

O programa nao interpreta automaticamente obrigacoes legais. A decisao do revisor deve incluir evidencias da licenca completa e das condicoes aplicaveis a todos os componentes. Hashes identificam artefatos; nao sao assinaturas digitais nem credenciais de autoridade.

Um registro vazio passa somente porque nao ha novos candidatos submetidos. Ele NAO certifica dependencias legadas, todos os arquivos do repositorio ou a pesquisa. Bloquear mudancas nao cadastradas de dependencias e proteger a aprovacao por revisor independente exigem a politica de branch/release; nao sao garantidos por um JSON que o proprio autor pode editar.

Nao foi admitido codigo novo de terceiros neste incremento. Preservar THIRD_PARTY_NOTICES.md e as licencas existentes.

New npm admissions use exact package version, registry SRI, actual installed files and a canonical-JSON digest of the referenced review document. The CLI reads and checks that document, so formatting/line-ending conversion is not confused with altered evidence. Reviewer independence still depends on branch protection and review; this hash is not a signature.
