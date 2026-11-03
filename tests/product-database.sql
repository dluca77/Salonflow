-- Run as postgres in SQL Editor. No fixtures survive this transaction.
begin;
do $$
declare u uuid:=gen_random_uuid(); s uuid:=gen_random_uuid();
begin
 insert into auth.users(id,email) values(u,'product-audit-'||u||'@example.invalid');
 insert into public.salons(id,owner_id,naam,plan) values(s,u,'Product rollback audit','free');
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('audit.salon',s::text,true);
end $$;
set local role authenticated;
do $$
declare p uuid; n integer;
begin
 insert into public.producten(salon_id,naam,prijs,voorraad_aantal,lage_voorraad_drempel,actief)
 values(current_setting('audit.salon')::uuid,'Test shampoo',12.50,4,0,true) returning id into p;
 update public.producten set naam='Changed shampoo',prijs=15 where id=p;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Owner cannot update product'; end if;
 if not exists(select 1 from public.producten where id=p and prijs=15) then raise exception 'Update not persisted'; end if;
 delete from public.producten where id=p;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Owner cannot delete product'; end if;
end $$;
reset role;
rollback;
select 'PASS: authenticated owner can create, read, update and delete products; fixtures rolled back' as result;
