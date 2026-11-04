begin;
create table if not exists public.kronr_request_limits (
 key text primary key, started_at timestamptz not null default now(), count integer not null default 1
);
alter table public.kronr_request_limits enable row level security;
revoke all on public.kronr_request_limits from anon,authenticated;
create or replace function public.kronr_claim_request(p_key text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 if p_limit<1 or p_seconds<1 or length(p_key)>200 then return false; end if;
 insert into kronr_request_limits as r(key) values(p_key)
 on conflict(key) do update set
 count=case when r.started_at<now()-make_interval(secs=>p_seconds) then 1 else r.count+1 end,
 started_at=case when r.started_at<now()-make_interval(secs=>p_seconds) then now() else r.started_at end
 returning count into n;
 return n<=p_limit;
end;
$$;
revoke execute on function public.kronr_claim_request(text,integer,integer) from public,anon,authenticated;
grant execute on function public.kronr_claim_request(text,integer,integer) to service_role;
commit;
