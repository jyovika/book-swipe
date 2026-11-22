-- Run once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.

-- One row per swiping session; the code is what the second phone types in to join.
create table sessions (
  code text primary key check (code ~ '^[A-Z0-9]{4,8}$'),
  -- How many books (from the top of books.json) this session swipes; set by whoever starts it,
  -- so both phones always swipe the same books.
  book_count smallint not null default 60 check (book_count between 1 and 500),
  created_at timestamptz not null default now()
);

-- One row per swipe. The primary key stops the same person swiping a book twice in a round.
create table swipes (
  session_code text not null references sessions (code),
  round smallint not null check (round in (1, 2)),
  player text not null check (char_length(player) between 1 and 30),
  book_id text not null check (char_length(book_id) <= 40),
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (session_code, round, player, book_id)
);

-- The app uses the public anon key (it's visible in the page source), so Row Level Security
-- decides what that key may do: read and add rows, never change or delete them.
-- Newer Supabase projects don't grant table access to the anon role automatically.
grant select, insert on sessions, swipes to anon;

alter table sessions enable row level security;
alter table swipes enable row level security;

create policy "anyone can read sessions" on sessions for select to anon using (true);
create policy "anyone can create a session" on sessions for insert to anon with check (true);
create policy "anyone can read swipes" on swipes for select to anon using (true);
create policy "anyone can add a swipe" on swipes for insert to anon with check (true);
