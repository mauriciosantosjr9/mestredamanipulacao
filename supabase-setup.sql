-- supabase-setup.sql
-- Cole TUDO isto em  Supabase > SQL Editor > New query > Run.
-- Antes, troque SEU_EMAIL_AQUI pelo e-mail que você vai usar para entrar no painel.

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sid        text not null,              -- sessão (aleatório, anônimo)
  vid        text,                       -- visitante (aleatório, anônimo)
  type       text not null,              -- pageview | scroll | engaged | cta_click | checkout_click | leave
  label      text,                       -- qual botão (hero, barra_fixa, dialogo...)
  value      numeric,                    -- % de rolagem, segundos...
  source     text,                       -- tiktok, instagram, kwai, shorts, direto...
  medium     text,
  campaign   text,
  referrer   text,
  device     text,
  browser    text,
  os         text,
  screen     text,
  lang       text,
  tz         text,
  path       text
);

create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_sid_idx     on public.events (sid);

alter table public.events enable row level security;

-- O site (visitante anônimo) só consegue INSERIR, e só eventos válidos e curtos.
drop policy if exists "site registra eventos" on public.events;
create policy "site registra eventos" on public.events
  for insert to anon
  with check (
    type in ('pageview','scroll','engaged','cta_click','checkout_click','leave')
    and char_length(sid) between 6 and 64
    and (vid      is null or char_length(vid)      <= 64)
    and (label    is null or char_length(label)    <= 40)
    and (source   is null or char_length(source)   <= 40)
    and (medium   is null or char_length(medium)   <= 40)
    and (campaign is null or char_length(campaign) <= 60)
    and (referrer is null or char_length(referrer) <= 80)
    and (device   is null or char_length(device)   <= 20)
    and (browser  is null or char_length(browser)  <= 30)
    and (os       is null or char_length(os)       <= 30)
    and (screen   is null or char_length(screen)   <= 20)
    and (lang     is null or char_length(lang)     <= 12)
    and (tz       is null or char_length(tz)       <= 40)
    and (path     is null or char_length(path)     <= 120)
  );

-- SÓ VOCÊ lê os dados: usuário logado cujo e-mail seja exatamente o abaixo.
drop policy if exists "dono le eventos" on public.events;
create policy "dono le eventos" on public.events
  for select to authenticated
  using ( (auth.jwt() ->> 'email') = 'SEU_EMAIL_AQUI' );

-- Reforço: o público não lê, altera nem apaga nada.
revoke select, update, delete on public.events from anon;
revoke update, delete          on public.events from authenticated;
grant  insert on public.events to anon;
grant  select on public.events to authenticated;
