// Cloud-Speicher für Accounts (optional).
// Leer = Accounts werden auf diesem Gerät gespeichert (Freunde & Online-Status funktionieren trotzdem geräteübergreifend).
// Für Accounts, die von überall erreichbar sind: kostenloses Supabase-Projekt anlegen und hier URL + "anon public" Key eintragen.
// Anleitung: docs/ACCOUNTS.md. Der anon-Key ist öffentlich gedacht – geschützt wird über die Row-Level-Security-Regeln.
export const CLOUD = {
  supabaseUrl: '',
  supabaseKey: '',
};
