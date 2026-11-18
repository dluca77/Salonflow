"""Verify anonymous Auth API requests cannot bypass CAPTCHA. No account is created."""
import json,urllib.request,urllib.error,secrets
BASE='https://pscybcirexnltqvziixt.supabase.co/auth/v1/'
KEY='sb_publishable_9cyuoATNMTImTp207rTHaA_sXGi5fm6'
email='captcha-denial-'+secrets.token_hex(6)+'@example.invalid'
for token in [None,'invalid-test-token']:
    for route,payload in [
        ('signup',{'email':email,'password':'Kr9!'+secrets.token_urlsafe(20)}),
        ('token?grant_type=password',{'email':email,'password':'NotARealPassword123!'}),
        ('recover',{'email':email}),
        ('resend',{'type':'signup','email':email})
    ]:
        if token is not None:payload['gotrue_meta_security']={'captcha_token':token}
        req=urllib.request.Request(BASE+route,headers={'apikey':KEY,'Content-Type':'application/json'},data=json.dumps(payload).encode())
        try:
            urllib.request.urlopen(req,timeout=30)
            raise RuntimeError(route+' unexpectedly accepted a request without valid CAPTCHA')
        except urllib.error.HTTPError as error:
            body=json.load(error)
            assert error.code==500 or error.code in (400,403,422), 'Unexpected status '+str(error.code)
            assert body.get('error_code')=='captcha_failed', 'Expected captcha_failed, received '+str(body.get('error_code'))
        print('PASS',route.split('?')[0], 'missing token rejected' if token is None else 'forged token rejected')
