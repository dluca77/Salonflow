"""Explicit live smoke test. Creates and removes its own isolated test account.
No emails sent: an admin-generated signup token exercises the real confirmation API.
Credentials and session tokens remain in memory and are never printed.
"""
import json, subprocess, secrets, urllib.request, urllib.error
REF='pscybcirexnltqvziixt'
BASE='https://'+REF+'.supabase.co'
PUBLIC='sb_publishable_9cyuoATNMTImTp207rTHaA_sXGi5fm6'
r=subprocess.run(['npx.cmd','supabase','projects','api-keys','--remote='+REF,'--reveal','--output-format','json'],capture_output=True,text=True,check=True)
keys=json.loads(r.stdout)['keys']; admin=next(k['api_key'] for k in keys if k['id']=='service_role')
def request(path,body=None,token=None,method=None,admin_mode=False):
 headers={'apikey':admin if admin_mode else PUBLIC,'Content-Type':'application/json','Prefer':'return=representation'}
 if token or admin_mode:headers['Authorization']='Bearer '+(admin if admin_mode else token)
 req=urllib.request.Request(BASE+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method or ('POST' if body is not None else 'GET'))
 try:
  with urllib.request.urlopen(req,timeout=30) as response:
   raw=response.read();return json.loads(raw) if raw else None
 except urllib.error.HTTPError as error:
  # No body/token logging, only safe status for diagnosis.
  raise RuntimeError('HTTP '+str(error.code)+' at '+path.split('?')[0]) from None
uid=None;salon=None
try:
 email='kronr-registration-'+secrets.token_hex(6)+'@example.invalid';password='Kr9!'+secrets.token_urlsafe(24)
 link=request('/auth/v1/admin/generate_link',{'type':'signup','email':email,'password':password,'data':{'bedrijf_naam':'Kronr Registration Smoke Test','contact_naam':'Test Owner','type_bedrijf':'Kapper','telefoon':'+31612345678'}},admin_mode=True)
 uid=link.get('user',link)['id']
 verified=request('/auth/v1/verify',{'type':'signup','token_hash':link['hashed_token']})
 token=verified['access_token'];assert verified['user']['email_confirmed_at'];print('PASS real auth email-confirmation token exchange (no email delivery tested)')
 salon=request('/rest/v1/rpc/kronr_start_salon',{},token)
 assert salon['owner_id']==uid and salon['plan']=='free' and salon['contact_naam']=='Test Owner' and salon['telefoon']=='+31612345678'
 again=request('/rest/v1/rpc/kronr_start_salon',{},token);assert again['id']==salon['id'];print('PASS new owner profile and idempotent free salon initialization')
 visible=request('/rest/v1/salons?select=id',token=token);assert len(visible)==1 and visible[0]['id']==salon['id'];print('PASS owner sees only own salon')
 service=request('/rest/v1/diensten',{'salon_id':salon['id'],'naam':'Registration test service','prijs':25,'duur_min':30,'actief':True},token)[0]
 customer=request('/rest/v1/klanten',{'salon_id':salon['id'],'naam':'Registration Test Customer','email':email},token)[0]
 appointment=request('/rest/v1/afspraken',{'salon_id':salon['id'],'dienst_id':service['id'],'klant_naam':customer['naam'],'klant_email':email,'datum_tijd':'2026-12-01T10:00:00Z','duur_min':30,'status':'bevestigd'},token)[0]
 for table in ('diensten','klanten','afspraken'):
  rows=request('/rest/v1/'+table+'?salon_id=eq.'+salon['id'],token=token);assert len(rows)==1
 print('PASS first service, customer and appointment saved/read with owner session')
 logged=request('/auth/v1/token?grant_type=password',{'email':email,'password':password});assert logged['user']['id']==uid;print('PASS password login after confirmation')
finally:
 if salon:
  for table in ('afspraken','klanten','diensten'):
   request('/rest/v1/'+table+'?salon_id=eq.'+salon['id'],method='DELETE',admin_mode=True)
  request('/rest/v1/salons?id=eq.'+salon['id'],method='DELETE',admin_mode=True)
 if uid:request('/auth/v1/admin/users/'+uid,method='DELETE',admin_mode=True)
 print('Test account and test records removed')
