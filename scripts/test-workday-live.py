"""Isolated real API workday. No customer emails or Stripe charges are sent.
Admin is used only to prepare/clean Auth fixtures. Business actions use user JWTs.
--keep retains successful fixtures for browser verification; --cleanup removes them.
"""
import os,json,secrets,urllib.request,urllib.error,datetime,argparse
from pathlib import Path
REF='pscybcirexnltqvziixt';BASE='https://'+REF+'.supabase.co';PUBLIC='sb_publishable_9cyuoATNMTImTp207rTHaA_sXGi5fm6'
STATE=Path.home()/'.codex/private-kronr/workday-test.json'
keys=json.load(urllib.request.urlopen(urllib.request.Request('https://api.supabase.com/v1/projects/'+REF+'/api-keys?reveal=true',headers={'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN']})))
ADMIN=next(x['api_key'] for x in keys if x.get('id')=='service_role' or x.get('name')=='service_role')
class ApiError(Exception):
 def __init__(self,status,body):self.status=status;self.body=body;super().__init__('HTTP '+str(status)+' '+str(body.get('message',body.get('msg',''))))
def req(path,data=None,token=None,method=None,admin=False):
 h={'apikey':ADMIN if admin else PUBLIC,'Content-Type':'application/json','Prefer':'return=representation'}
 if token or admin:h['Authorization']='Bearer '+(ADMIN if admin else token)
 r=urllib.request.Request(BASE+path,headers=h,data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=30) as out:
   raw=out.read();return json.loads(raw) if raw else None
 except urllib.error.HTTPError as e:raise ApiError(e.code,json.load(e)) from None
def rpc(name,data,token=None):return req('/rest/v1/rpc/'+name,data,token)
def check(condition,message):
 if not condition:raise AssertionError(message)
 print('PASS '+message,flush=True)
def denied(fn):
 try:r=fn();return r is False or r is None or r==[]
 except ApiError:return True
def cleanup(state):
 for s in state.get('salons',[]):
  for table in ['verkoop_items','betalingen','kassa_afsluitingen','cadeaubonnen','afspraken','klanten','producten','diensten','medewerkers']:
   req('/rest/v1/'+table+'?salon_id=eq.'+s,method='DELETE',admin=True)
  req('/rest/v1/salons?id=eq.'+s,method='DELETE',admin=True)
 for u in state.get('users',[]):req('/auth/v1/admin/users/'+u['id'],method='DELETE',admin=True)
 STATE.unlink(missing_ok=True);print('Fixtures removed',flush=True)
def run(keep):
 assert not STATE.exists(),'Previous fixtures need --cleanup first'
 state={'users':[],'salons':[]};success=False
 def save():STATE.write_text(json.dumps(state))
 def user(label):
  email='workday-'+label+'-'+secrets.token_hex(6)+'@example.invalid';password='Kr9!'+secrets.token_urlsafe(24)
  link=req('/auth/v1/admin/generate_link',{'type':'signup','email':email,'password':password,'data':{'bedrijf_naam':'Kronr werkdagtest '+label,'contact_naam':'Test '+label}},admin=True)
  u={'id':link.get('user',link)['id'],'email':email,'password':password};state['users'].append(u);save()
  session=req('/auth/v1/verify',{'type':'signup','token_hash':link['hashed_token']});u['token']=session['access_token'];save();return u
 try:
  owner=user('owner');staff=user('staff');foreign=user('foreign');ot=owner['token'];st=staff['token'];ft=foreign['token']
  salon=rpc('kronr_start_salon',{},ot);s=salon['id'];state['salons'].append(s);save()
  other=rpc('kronr_start_salon',{},ft)['id'];state['salons'].append(other);save()
  check(salon['plan']=='free' and rpc('kronr_start_salon',{},ot)['id']==s,'confirmed owner provisioning and repeat startup')
  hours={day:{'gesloten':False,'open':'09:00','dicht':'18:00'} for day in ['ma','di','wo','do','vr','za','zo']}
  req('/rest/v1/salons?id=eq.'+s,{'openingstijden':hours,'annuleer_cutoff_uren':0,'slug':'workday-'+secrets.token_hex(6)},ot,'PATCH')
  rights={'agenda':'bewerken','klanten':'bekijken','diensten':'bekijken','kassa':'geen','rapportages':'geen'}
  employee=req('/rest/v1/medewerkers',{'salon_id':s,'naam':'Test medewerker','email':staff['email'],'actief':True,'rechten':rights},ot)[0]
  invite=rpc('maak_medewerker_uitnodiging',{'p_medewerker_id':employee['id']},ot)
  check(denied(lambda:rpc('accepteer_medewerker_uitnodiging',{'p_token':invite},ft)),'wrong account cannot accept staff invitation')
  check(rpc('accepteer_medewerker_uitnodiging',{'p_token':invite},st) is True,'staff accepts matching invitation')
  check(denied(lambda:rpc('accepteer_medewerker_uitnodiging',{'p_token':invite},st)),'invitation cannot be replayed')
  service=req('/rest/v1/diensten',{'salon_id':s,'naam':'Werkdag knippen','prijs':35,'duur_min':30,'actief':True},ot)[0]
  product=req('/rest/v1/producten',{'salon_id':s,'naam':'Werkdag shampoo','prijs':12.50,'voorraad_aantal':5,'actief':True},ot)[0]
  customer=req('/rest/v1/klanten',{'salon_id':s,'naam':'Werkdag klant','email':owner['email']},ot)[0]
  check(denied(lambda:req('/rest/v1/klanten?id=eq.'+customer['id'],{'naam':'Forbidden'},st,'PATCH')),'read-only staff cannot edit customer')
  check(req('/rest/v1/klanten?salon_id=eq.'+s,token=ft)==[],'another owner cannot see customers')
  day=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=3)).replace(hour=10,minute=0,second=0,microsecond=0)
  row={'salon_id':s,'medewerker_id':employee['id'],'dienst_id':service['id'],'datum_tijd':day.isoformat(),'klant_naam':'Werkdag klant','klant_email':owner['email'],'duur_min':1,'status':'afgerond'}
  booked=rpc('kronr_boek_afspraken',{'p_rows':[row],'p_extra':[]})[0];aid=booked['id']
  appointment=req('/rest/v1/afspraken?id=eq.'+aid,token=ot)[0]
  check(appointment['duur_min']==30 and appointment['status']=='gepland','public booking uses server duration/status')
  check(denied(lambda:rpc('kronr_boek_afspraken',{'p_rows':[row],'p_extra':[]})),'duplicate public booking rejected')
  moved=(day+datetime.timedelta(hours=1)).isoformat()
  check(len(req('/rest/v1/afspraken?id=eq.'+aid,{'datum_tijd':moved,'status':'bevestigd'},st,'PATCH'))==1,'staff can move and confirm appointment')
  check(req('/rest/v1/afspraken?id=eq.'+aid,token=ot)[0]['datum_tijd'].startswith(moved[:19]),'owner sees staff change persisted')
  check(rpc('annuleer_afspraak_via_token',{'p_token':booked['annuleer_token']}) is True,'customer token cancels appointment')
  check(denied(lambda:rpc('annuleer_afspraak_via_token',{'p_token':booked['annuleer_token']})),'repeat cancellation is harmless')
  row['datum_tijd']=moved
  replacement=rpc('kronr_boek_afspraken',{'p_rows':[row],'p_extra':[]})[0]
  check(bool(replacement['id']),'cancelled time becomes bookable again')
  payment={'p_salon_id':s,'p_locatie_id':None,'p_methode':'cash','p_afspraak_id':replacement['id'],'p_items':[{'type':'dienst','dienst_id':service['id'],'prijs':0.01,'aantal':1},{'type':'product','product_id':product['id'],'prijs':0.01,'aantal':2}],'p_cadeaubon_code_gebruikt':None,'p_cadeaubon_bedrag_gebruikt':None,'p_nieuwe_cadeaubonnen':[]}
  check(denied(lambda:rpc('verwerk_kassa_betaling',payment,st)),'staff without cash permission cannot checkout')
  rights['kassa']='gebruiken';req('/rest/v1/medewerkers?id=eq.'+employee['id'],{'rechten':rights},ot,'PATCH')
  paid=rpc('verwerk_kassa_betaling',payment,st)[0];pid=paid['betaling_id']
  check(float(req('/rest/v1/betalingen?id=eq.'+pid,token=ot)[0]['bedrag'])==60,'staff checkout uses actual server prices: 60 EUR')
  check(req('/rest/v1/producten?id=eq.'+product['id'],token=ot)[0]['voorraad_aantal']==3,'checkout deducts product stock exactly once')
  check(req('/rest/v1/afspraken?id=eq.'+replacement['id'],token=ot)[0]['status']=='afgerond','paid appointment marked completed')
  check(denied(lambda:rpc('verwerk_kassa_betaling',payment,st)),'repeat checkout cannot charge twice')
  check(denied(lambda:rpc('annuleer_afspraak_via_token',{'p_token':replacement['annuleer_token']})),'completed paid appointment cannot be cancelled by old link')
  total=rpc('bekijk_kassa_dag_totalen',{'p_salon_id':s,'p_locatie_id':None},ot)[0]
  check(float(total['systeem_contant'])==60,'day cash total reconciles with recorded sale')
  rpc('sluit_kassa_dag_af',{'p_salon_id':s,'p_locatie_id':None,'p_geteld_contant':60,'p_notitie':'Isolated workday test','p_afgesloten_door_naam':'Test owner'},ot)
  check(len(req('/rest/v1/kassa_afsluitingen?salon_id=eq.'+s,token=ot))==1,'day close persisted')
  req('/rest/v1/medewerkers?id=eq.'+employee['id'],{'actief':False},ot,'PATCH')
  check(req('/rest/v1/afspraken?salon_id=eq.'+s,token=st)==[],'deactivated staff loses appointment access immediately')
  req('/rest/v1/medewerkers?id=eq.'+employee['id'],{'actief':True},ot,'PATCH')
  state.update({'service':service['id'],'product':product['id'],'employee':employee['id'],'customer':customer['id']});save();success=True
 finally:
  if not(success and keep):cleanup(state)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--keep',action='store_true');p.add_argument('--cleanup',action='store_true');a=p.parse_args()
 if a.cleanup:cleanup(json.loads(STATE.read_text()))
 else:run(a.keep)
