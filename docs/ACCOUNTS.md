# Accounts – Cloud-Speicher einrichten (optional)

Ohne Einrichtung werden Accounts **auf dem Gerät** gespeichert. Freundescodes und der Online-Status
funktionieren trotzdem geräteübergreifend (über PeerJS).

Damit man sich **auf jedem Gerät** anmelden kann und der Spielstand mitkommt, braucht das Spiel einen
kleinen Server. Am einfachsten ist ein kostenloses [Supabase](https://supabase.com)-Projekt.

> Warum nicht direkt in GitHub? Dafür müsste ein Schreib-Token für das Repository offen im Spielcode
> stehen. Jeder Spieler könnte ihn auslesen und damit alle Accounts lesen sowie das Repository ändern
> oder löschen. Supabase dagegen schützt die Daten über Anmeldung und Zugriffsregeln.

## 1. Projekt anlegen
1. Auf supabase.com ein kostenloses Projekt erstellen.
2. **Authentication → Providers → Email**: „Confirm email“ **ausschalten**
   (Accounts nutzen Name + Passwort, keine echte E-Mail).
3. **SQL Editor** öffnen und Folgendes ausführen:

```sql
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text unique not null,
  char_name text,
  avatar jsonb,
  friend_code text unique not null,
  friends jsonb default '[]'::jsonb,
  last_seen timestamptz default now()
);
create table public.saves (
  id uuid primary key references auth.users on delete cascade,
  data jsonb,
  updated timestamptz default now()
);
alter table public.profiles enable row level security;
alter table public.saves enable row level security;

-- Profile: jeder angemeldete Spieler darf Profile lesen (für Freundescodes), ändern nur das eigene
create policy "profiles lesen" on public.profiles for select to authenticated using (true);
create policy "eigenes profil anlegen" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "eigenes profil ändern" on public.profiles for update to authenticated using (auth.uid() = id);

-- Spielstände: nur der eigene
create policy "eigener spielstand" on public.saves for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);
```

### Feedback-Tabelle (für „Feedback & Ideen“ im Titelbild)
Jeder – auch ohne Account – darf Vorschläge lesen, hinzufügen und löschen:

```sql
create table public.feedback (
  id bigint generated always as identity primary key,
  created timestamptz default now(),
  kind text, text text not null check (char_length(text) <= 1200),
  name text, version text
);
alter table public.feedback enable row level security;
create policy "feedback lesen" on public.feedback for select to anon, authenticated using (true);
create policy "feedback schreiben" on public.feedback for insert to anon, authenticated with check (true);
create policy "feedback löschen" on public.feedback for delete to anon, authenticated using (true);
```

## 2. Schlüssel eintragen
Unter **Project Settings → API** die **Project URL** und den **anon public** Key kopieren und in
`js/cloud-config.js` eintragen:

```js
export const CLOUD = {
  supabaseUrl: 'https://xxxx.supabase.co',
  supabaseKey: 'eyJ…',   // anon public key – darf öffentlich sein
};
```

Danach speichert das Spiel Accounts, Freundeslisten und Spielstände in der Cloud.

## Hinweise
- Der Freischalt-Code für neue Accounts steht in `js/accounts.js` (`REG_CODE`, aktuell `1111`).
  Er wird im Browser geprüft und ist damit eine einfache Hürde, kein echter Schutz.
- Online-Status: jeder angemeldete Spieler ist über PeerJS unter `neoncoast-acc-<Freundescode>` erreichbar.
