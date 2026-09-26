
## Achado adicional — preview gerado quebra por dependência ausente

A captura fornecida pelo usuário mostrou o preview de um projeto clonado falhando no Vite:

```text
[plugin:vite:import-analysis] Failed to resolve import "lucide-react"
from "src/components/LoginForm.jsx". Does the file exist?
```

A causa foi confirmada no código: `lib/projects/preview.ts` autorizava `lucide-react` e outras bibliotecas para o preview isolado, mas os manifestos base criados por `lib/sandbox/providers/e2b-provider.ts` e `lib/sandbox/providers/vercel-provider.ts` instalavam apenas `react` e `react-dom`. Assim, o gerador podia produzir uma importação permitida sem que o sandbox externo tivesse a dependência instalada.

### Correção aplicada

Os dois provedores agora instalam no `package.json` inicial o conjunto de dependências visuais aprovado pelo compilador bounded preview:

- `lucide-react`;
- `react-icons`;
- `framer-motion`;
- `motion`;
- `clsx`;
- `classnames`;
- `tailwind-merge`;
- `lodash-es`.

Foi adicionada a regressão `tests/sandbox-dependencies.test.ts`, executada com lint, typecheck e os testes dos provedores:

```text
7 tests, 7 pass, 0 fail
```

A correção cobre novos sandboxes. Sandboxes já existentes precisam ser recriados ou receber instalação/restart controlado para atualizar seu `node_modules`; isso não deve ser declarado como corrigido sem executar essa operação no sandbox real.
