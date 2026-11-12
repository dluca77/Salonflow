do $$
declare u uuid:=gen_random_uuid();s uuid:=gen_random_uuid();d uuid:=gen_random_uuid();e uuid:=gen_random_uuid();a uuid;v jsonb;failed boolean:=false;
begin
 insert into auth.users(id,email) values(u,'multi-'||u||'@example.invalid');
 insert into salons(id,owner_id,naam) values(s,u,'Rollback multiservice');
 insert into diensten(id,salon_id,naam,duur_min,prijs) values(d,s,'Main',30,20),(e,s,'Extra',15,10);
 perform set_config('request.jwt.claim.sub',u::text,true);
 v:=jsonb_build_object('salon_id',s,'dienst_id',d,'klant_naam','Rollback','datum_tijd',now()+interval '8 days','duur_min',45,'status','bevestigd');
 a:=kronr_bewaar_agenda_afspraak(v,null,array[e]);
 if (select count(*) from afspraak_extra_diensten where afspraak_id=a)<>1 then raise exception 'Extra not stored';end if;
 perform kronr_bewaar_agenda_afspraak(v,a,array[e]);
 if (select count(*) from afspraak_extra_diensten where afspraak_id=a)<>1 then raise exception 'Duplicate extra';end if;
 begin perform kronr_bewaar_agenda_afspraak(v||'{"klant_naam":"Must not persist"}',a,array[gen_random_uuid()]);exception when others then failed:=true;end;
 if not failed or (select klant_naam from afspraken where id=a)<>'Rollback' then raise exception 'Atomic validation failed';end if;
 perform kronr_bewaar_agenda_afspraak(v,a,'{}');
 if exists(select 1 from afspraak_extra_diensten where afspraak_id=a) then raise exception 'Extra not removed';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);failed:=false;
 begin perform kronr_bewaar_agenda_afspraak(v,a,'{}');exception when others then failed:=true;end;
 if not failed then raise exception 'Unauthorized edit';end if;
end $$;
