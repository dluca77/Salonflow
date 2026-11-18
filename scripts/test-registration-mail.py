"""Live end-to-end Auth email test using a temporary Kronr routing alias.
Only test mail, test Auth user and test salon are removed. Secrets stay in memory.
"""
import json, subprocess, secrets, urllib.request, urllib.error, urllib.parse, re, time, datetime, html, sys, os
from pathlib import Path
REF='pscybcirexnltqvziixt'; BASE='https://'+REF+'.supabase.co'
PUBLIC='sb_publishable_9cyuoATNMTImTp207rTHaA_sXGi5fm6'; ZONE='ea0b40abe921e0c976d41ff11861fd22'
r=subprocess.run(['npx.cmd','supabase','projects','api-keys','--remote='+REF,'--reveal','--output-format','json'],capture_output=True,text=True,check=True)
admin=next(k['api_key'] for k in json.loads(r.stdout)['keys'] if k['id']=='service_role')
cf=re.search(r'oauth_token\s*=\s*"([^"]+)"',Path('C:/Users/isaak/AppData/Roaming/xdg.config/.wrangler/config/default.toml').read_text()).group(1)
def req(path,body=None,token=None,method=None,privileged=False,cloud=False,expected=()):
 headers={'Content-Type':'application/json'}
 if cloud:headers['Authorization']='Bearer '+cf
 else:
  headers['apikey']=admin if privileged else PUBLIC
  headers['Prefer']='return=representation'
  if token or privileged:headers['Authorization']='Bearer '+(admin if privileged else token)
 url=('https://api.cloudflare.com/client/v4/' if cloud else BASE)+path
 request=urllib.request.Request(url,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(request,timeout=30) as response:
   raw=response.read();return json.loads(raw) if raw else None
 except urllib.error.HTTPError as error:
  if error.code in expected:return {'expected_error':error.code}
  # Deliberately omit response body, which could contain credentials.
  raise RuntimeError('HTTP '+str(error.code)+' '+path.split('?')[0]) from None

def auth_hash(column):
 assert column in ('confirmation_token','recovery_token')
 query="select "+column+" as hash from auth.users where id='"+uid+"'"
 out=subprocess.run(['npx.cmd','supabase','db','query','--remote='+REF,'--read-only',query],capture_output=True,text=True,check=True)
 return json.loads(out.stdout)['rows'][0]['hash']
def received_link(column):
 expected=auth_hash(column)
 for attempt in range(18):
  rows=req('/rest/v1/kronr_berichten?select=id,inhoud&van_email=eq.boekingen%40kronr.nl&ontvangen_op=gte.'+urllib.parse.quote(start)+'&order=ontvangen_op.desc',privileged=True)
  for row in rows:
   text=html.unescape(row['inhoud'] or '')
   for url in re.findall(r'https://[^\s<>"\]]+',text):
    parts=urllib.parse.urlparse(url.rstrip(').'));q=urllib.parse.parse_qs(parts.query)
    if parts.hostname==REF+'.supabase.co' and parts.path=='/auth/v1/verify' and q.get('token',[''])[0]==expected:
     mail_ids.add(row['id']);return q
  time.sleep(3)
 raise RuntimeError('No matching delivered Auth email within 54 seconds')
browser_file=Path(os.environ['TEMP'])/'kronr-registration-browser.json'
browser_done=Path(os.environ['TEMP'])/'kronr-registration-browser.done'
uid=None;salon=None;route=None;mail_ids=set();start=datetime.datetime.now(datetime.timezone.utc).isoformat()
try:
 email='registration-test-'+secrets.token_hex(6)+'@kronr.nl';password='Kr9!'+secrets.token_urlsafe(24)
 route=req('zones/'+ZONE+'/email/routing/rules',{'name':'Temporary Kronr registration test','enabled':True,'matchers':[{'type':'literal','field':'to','value':email}],'actions':[{'type':'worker','value':['kronr-postvak']}]},cloud=True)['result']['id']
 print('Temporary email route ready; allowing routing propagation',flush=True)
 time.sleep(25)
 signup=req('/auth/v1/signup?redirect_to=https%3A%2F%2Fkronr.nl%2Flogin%2F',{'email':email,'password':password,'data':{'bedrijf_naam':'Kronr Mail Registration Test','contact_naam':'Test Owner','type_bedrijf':'Kapper','telefoon':'+31612345678'}})
 uid=signup.get('user',signup)['id'];print('PASS public signup accepted; confirmation required',flush=True)
 assert not signup.get('access_token')
 link=received_link('confirmation_token');print('PASS actual signup email delivered to Kronr inbox with matching confirmation token',flush=True)
 assert link.get('redirect_to')==['https://kronr.nl/login/']
 verified=req('/auth/v1/verify',{'type':'signup','token_hash':link['token'][0]});token=verified['access_token'];assert verified['user']['id']==uid
 assert req('/auth/v1/verify',{'type':'signup','token_hash':link['token'][0]},expected=(403,400,422)).get('expected_error');print('PASS delivered link confirms only test account; reused token rejected',flush=True)
 if '--browser' in sys.argv:
  browser_done.unlink(missing_ok=True)
  browser_file.write_text(json.dumps({'email':email,'password':password}),encoding='utf-8')
  print('Browser test account ready; credentials in local temporary file only',flush=True)
  for _ in range(120):
   if browser_done.exists():break
   time.sleep(3)
  else:raise RuntimeError('Browser test timed out')
 salon=req('/rest/v1/rpc/kronr_start_salon',{},token);assert salon['plan']=='free' and salon['owner_id']==uid
 assert req('/rest/v1/rpc/kronr_start_salon',{},token)['id']==salon['id'];print('PASS own free salon initialized once',flush=True)
 logged=req('/auth/v1/token?grant_type=password',{'email':email,'password':password});assert logged['user']['id']==uid
 req('/auth/v1/logout',{},logged['access_token']);print('PASS password sign-in and logout',flush=True)
 req('/auth/v1/recover?redirect_to=https%3A%2F%2Fkronr.nl%2Flogin%2F%3Freset%3D1',{'email':email})
 reset=received_link('recovery_token');assert reset.get('redirect_to')==['https://kronr.nl/login/?reset=1'];print('PASS actual password recovery email delivered with correct redirect',flush=True)
 recovered=req('/auth/v1/verify',{'type':'recovery','token_hash':reset['token'][0]});assert recovered['user']['id']==uid
 newpass='Kr9!'+secrets.token_urlsafe(24);req('/auth/v1/user',{'password':newpass},recovered['access_token'],method='PUT')
 assert req('/auth/v1/token?grant_type=password',{'email':email,'password':password},expected=(400,401)).get('expected_error')
 assert req('/auth/v1/token?grant_type=password',{'email':email,'password':newpass})['user']['id']==uid
 print('PASS recovered password works; old password rejected; Stripe untouched',flush=True)
finally:
 if uid and not salon:
  own=req('/rest/v1/salons?owner_id=eq.'+uid,privileged=True)
  salon=own[0] if own else None
 if salon:
  for table in ('afspraken','klanten','diensten'):
   req('/rest/v1/'+table+'?salon_id=eq.'+salon['id'],method='DELETE',privileged=True)
  req('/rest/v1/salons?id=eq.'+salon['id'],method='DELETE',privileged=True)
 if uid:req('/auth/v1/admin/users/'+uid,method='DELETE',privileged=True)
 for mid in mail_ids:req('/rest/v1/kronr_berichten?id=eq.'+mid,method='DELETE',privileged=True)
 if route:req('zones/'+ZONE+'/email/routing/rules/'+route,method='DELETE',cloud=True)
 if '--browser' in sys.argv:
  browser_file.unlink(missing_ok=True);browser_done.unlink(missing_ok=True)
 print('Removed temporary routing alias, test user/salon and identified test emails',flush=True)
