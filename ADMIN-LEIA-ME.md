# Painel de administração — como ativar (5 minutos)

O painel fica em `admin.html` (ex.: `https://SEU-SITE/admin.html`). Só quem entra com o **seu e-mail e senha** vê os dados.
Para ver como ele é antes de configurar: `admin.html?demo=1` (dados fictícios).

## Passo a passo
1. **Supabase (gratuito):** crie conta em https://supabase.com e um projeto novo (guarde a senha do banco).
2. **Tabela e segurança:** abra `supabase-setup.sql`, troque `SEU_EMAIL_AQUI` pelo seu e-mail, cole tudo em *SQL Editor → New query* e clique **Run**.
3. **Seu usuário:** *Authentication → Users → Add user*, com o mesmo e-mail e uma senha forte.
   Depois, em *Sign In / Providers*, **desative "Allow new users to sign up"** (ninguém mais consegue criar conta).
4. **Chaves:** *Project Settings → API*. Copie a **Project URL** e a chave **anon public** para `config.js`.
5. Publique de novo (GitHub). Pronto: o site passa a registrar os acessos e o painel pede seu login.

## Segurança
- Os visitantes só conseguem **gravar** eventos curtos e válidos. Ninguém lê, altera ou apaga nada sem o seu login.
- Os dados só são liberados para o usuário logado com o **e-mail exato** colocado no SQL.
- A chave `anon` no `config.js` é pública por natureza; a proteção real é o login + as regras do banco.
- Suas próprias visitas **não contam** (ao entrar no painel, o navegador é marcado como "dono").

## O que é medido (anônimo: sem cookies, sem IP, sem nome/telefone)
- **Origem:** TikTok, Instagram, Kwai, YouTube/Shorts, Google, Facebook, WhatsApp, Telegram ou Direto.
- **Visita, rolagem (25/50/75/95%), tempo na página, aparelho e navegador.**
- **Cliques nos botões de compra** (qual botão: topo, card da oferta, barra fixa, final…) e **ida ao checkout** (botão do diálogo "Ir para o pagamento seguro").
- Os cliques de compra repassam a origem para a Kiwify (`utm_source`, `utm_medium`, `utm_campaign`, `src`).
  As **vendas confirmadas** continuam no painel da Kiwify; aqui você vê a intenção de compra.

## Como a origem é descoberta
1. Pelo link com `?utm_source=` (o jeito mais exato). O painel gera os links prontos em **"Links para cada rede"**:
   cole um em cada bio/descrição (TikTok, Instagram, Kwai, Shorts).
2. Se não houver, pelo site de onde a pessoa veio (referrer) ou pelo navegador interno do app (TikTok/Instagram/Kwai).
3. Sem nenhum sinal: **Direto**.

## Observações
- Aviso de privacidade (LGPD): como os dados são anônimos, basta citar no rodapé/política que o site mede acessos de forma agregada.
- O plano gratuito do Supabase pausa projetos sem uso por semanas; basta reativar no painel deles.

## Assistente "Mestre IA" (o mascote do painel)
O mascote 3D vive no painel e vira seu assistente. Clique nele (ou em **✦ Mestre IA** no topo) para abrir.
Tudo roda **no seu navegador**: nenhum dado do painel é enviado a terceiros e não há custo de IA.
É um motor de análise em português (não um modelo de linguagem): ele calcula em cima dos seus números.

- **Resumo do dia:** visitas, cliques em comprar, checkouts, comparação com o período anterior e projeção de fechamento do dia.
- **Radar de insights:** avisa de queda ou alta de tráfego, rede que traz visita mas não vende, redes que mais convertem,
  gente saindo antes de 25% da página, desistência na janela "Seu pedido", diferença entre celular e computador,
  horário/dia de pico, botão campeão e muita visita "Direto" (sem origem). Cada alerta traz uma sugestão e um botão que leva ao gráfico.
- **Ao vivo (a cada 15 s):** quando alguém clica em comprar ou vai ao checkout, o mascote comemora, mostra um balão,
  o botão ganha um ponto verde e a aba pisca no título. Dá para ativar "Avisar no navegador" (notificação com a aba em segundo plano).
- **Perguntas em português:** "qual a melhor fonte?", "melhor horário para postar", "compare tiktok e instagram",
  "onde estou perdendo gente?", "qual a conversão?", "o que devo fazer agora?", "quantos online?".
- **Comandos:** "mostrar 30 dias", "filtrar instagram", "limpar filtro", "exportar csv", "link do kwai" (copia o link).
- **Novos gráficos:** *Melhores horários* e *Dias da semana*.
- Dá para desligar o mascote solto na tela em "Mascote livre na tela".