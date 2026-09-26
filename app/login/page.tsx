import LoginForm from '@/components/account/LoginForm';
export default function LoginPage(){
 return <main className="min-h-screen bg-[#f7f7f3] text-[#282821]">
  <header className="mx-auto max-w-6xl px-[24px] py-[28px] text-base font-semibold tracking-tight md:px-[40px]">Open Lovable <span className="ml-[12px] border-l border-[#d6d6cb] pl-[12px] text-sm font-normal text-[#747467]">Workspace</span></header>
  <div className="mx-auto grid min-h-[72vh] max-w-6xl items-center gap-[48px] px-[24px] pb-[56px] md:grid-cols-[1fr_1fr] md:gap-[80px] md:px-[40px]">
   <section className="max-w-xl border-l-2 border-[#a44826] pl-[24px] md:pl-[32px]">
    <p className="mb-[20px] text-xs font-medium uppercase tracking-[0.17em] text-[#8d482b]">Seu espaço de criação</p>
    <h2 className="text-3xl font-semibold leading-tight tracking-tight md:text-5xl">Da ideia à próxima versão, com sua equipe.</h2>
    <p className="mt-[24px] max-w-md text-base leading-relaxed text-[#707063]">Planeje mudanças, revise o código e mantenha o histórico de cada projeto. Entre para acessar os workspaces aos quais você pertence.</p>
    <p className="mt-[32px] text-sm text-[#66665b]">Projetos · Revisões · Referências · Equipes</p>
   </section>
   <section className="w-full max-w-md rounded-lg border border-[#ddddcf] bg-white p-[24px] md:p-[36px]" aria-labelledby="login-heading">
    <h1 id="login-heading" className="text-2xl font-semibold tracking-tight">Entre no seu workspace</h1>
    <p className="mb-[28px] mt-[12px] text-sm leading-relaxed text-[#737367]">Use a conta configurada para esta instalação. Seus acessos são definidos pelos administradores de cada workspace.</p>
    <LoginForm/>
   </section>
  </div>
  <footer className="mx-auto max-w-6xl border-t border-[#deded3] px-[24px] py-[20px] text-xs leading-relaxed text-[#66665b] md:px-[40px]">Esta instalação é independente. O responsável pelo servidor administra o provedor de conta e as permissões.</footer>
 </main>;
}
