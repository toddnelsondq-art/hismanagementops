-- Run once in the Supabase SQL Editor before using the DQ OPS receipt archive.
insert into storage.buckets(id, name, public)
values ('dqops-receipts', 'dqops-receipts', false)
on conflict (id) do update set public = false;
