-- Add location contact details to an existing DQ OPS Supabase project.
alter table public.locations add column if not exists address text not null default '';
alter table public.locations add column if not exists phone text not null default '';
