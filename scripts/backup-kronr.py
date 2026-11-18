"""Encrypted logical backup: database, Auth configuration and Storage objects.
Requires SUPABASE_ACCESS_TOKEN, KRONR_BACKUP_KEY (Fernet), pg_dump 17+.
No credentials or customer records are logged. Output must be outside the repository.
"""
import os, json, urllib.request, urllib.parse, subprocess, tempfile, secrets, datetime, hashlib, io, zipfile, argparse
from pathlib import Path
from cryptography.fernet import Fernet

REF = 'pscybcirexnltqvziixt'
def api(path, data=None):
    req = urllib.request.Request('https://api.supabase.com/v1/projects/'+REF+'/'+path,
        headers={'Authorization':'Bearer '+os.environ['SUPABASE_ACCESS_TOKEN'],'Content-Type':'application/json'},
        data=json.dumps(data).encode() if data is not None else None)
    with urllib.request.urlopen(req, timeout=120) as response: return json.load(response)
def query(sql, readonly=True): return api('database/query', {'query':sql,'read_only':readonly})
def ident(value): return '"'+value.replace('"','""')+'"'
def literal(value): return "'"+value.replace("'","''")+"'"

def backup(output, pg_dump):
    output=Path(output).resolve(); repo=Path(__file__).resolve().parent.parent
    if output==repo or repo in output.parents: raise ValueError('Backup output must be outside the public repository')
    cipher=Fernet(os.environ['KRONR_BACKUP_KEY'].encode())
    output.mkdir(parents=True,exist_ok=True)
    stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    role='kronr_backup_'+secrets.token_hex(8); password=secrets.token_urlsafe(36);created=False
    try:
        query('create role '+ident(role)+' login password '+literal(password)+" valid until "+literal((datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=1)).isoformat())+';grant pg_read_all_data to '+ident(role)+';',False);created=True
        pool=api('config/database/pooler')[0]
        env=dict(os.environ,PGPASSWORD=password,PGSSLMODE='require',PGCONNECT_TIMEOUT='20')
        command=[pg_dump,'-h',pool['db_host'],'-p','5432','-U',role+'.'+REF,'-d','postgres','--schema-only','--no-owner','--schema=public','--schema=auth','--schema=storage']
        dumped=subprocess.run(command,env=env,capture_output=True,check=True)
        tables=query("select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth','storage') and c.relkind='r' order by 1,2")
        # One SQL statement = one MVCC snapshot for every table, including Auth.
        parts=["select "+literal(t['schema']+'.'+t['name'])+" as name,coalesce(jsonb_agg(to_jsonb(t)),'[]') as rows from "+ident(t['schema'])+'.'+ident(t['name'])+' t' for t in tables]
        data=query(' union all '.join(parts))
        columns=query("select table_schema,table_name,column_name,is_generated from information_schema.columns where table_schema in ('public','auth','storage') order by table_schema,table_name,ordinal_position")
        roles=query("select rolname,rolbypassrls from pg_roles where rolname !~ '^pg_' and rolname !~ '^kronr_backup_' order by rolname")
        sequences=query("select schemaname,sequencename,last_value from pg_sequences where schemaname in ('public','auth','storage')")
        authconfig=api('config/auth')
        key=next(k['api_key'] for k in api('api-keys?reveal=true') if k['name']=='service_role' or k.get('id')=='service_role')
        archive=io.BytesIO(); counts={t['name']:len(t['rows']) for t in data}
        with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('schema.sql',dumped.stdout)
            z.writestr('data.json',json.dumps(data))
            z.writestr('columns.json',json.dumps(columns))
            z.writestr('roles.json',json.dumps(roles))
            z.writestr('sequences.json',json.dumps(sequences))
            z.writestr('auth-config.json',json.dumps(authconfig))
            objects=next(t['rows'] for t in data if t['name']=='storage.objects'); storage=[]
            for index,obj in enumerate(objects):
                path=urllib.parse.quote(obj['bucket_id']+'/'+obj['name'],safe='/')
                req=urllib.request.Request('https://'+REF+'.supabase.co/storage/v1/object/'+path,headers={'Authorization':'Bearer '+key,'apikey':key})
                with urllib.request.urlopen(req,timeout=120) as response: raw=response.read()
                filename='objects/'+str(index)
                z.writestr(filename,raw);storage.append({'file':filename,'bucket':obj['bucket_id'],'name':obj['name'],'sha256':hashlib.sha256(raw).hexdigest()})
            z.writestr('storage-manifest.json',json.dumps(storage))
            manifest={'project':REF,'created_utc':stamp,'counts':counts,'objects':len(storage),'format':1}
            z.writestr('manifest.json',json.dumps(manifest))
        # Refuse a mixed file snapshot if uploads changed while downloading.
        after=query('select id,updated_at from storage.objects order by id')
        before=sorted([{'id':x['id'],'updated_at':x['updated_at']} for x in objects],key=lambda x:x['id'])
        for collection in (after,before):
            for item in collection:
                value=item['updated_at'].replace('T',' ').replace('Z','+00:00')
                if value.endswith('+00'):value+=':00'
                item['updated_at']=datetime.datetime.strptime(value,'%Y-%m-%d %H:%M:%S.%f%z' if '.' in value else '%Y-%m-%d %H:%M:%S%z').isoformat()
        if after!=before: raise RuntimeError('Storage changed during backup; retry required')
        encrypted=cipher.encrypt(archive.getvalue())
        final=output/('kronr-'+stamp+'.backup.fernet');partial=final.with_suffix('.partial');partial.write_bytes(encrypted);partial.replace(final)
        print(json.dumps({'backup':str(final),'sha256':hashlib.sha256(encrypted).hexdigest(),'tables':len(data),'rows':sum(counts.values()),'storage_objects':len(storage)}),flush=True)
        return final
    finally:
        if created: query('drop role '+ident(role)+';',False)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--pg-dump',default='pg_dump')
    args=parser.parse_args();backup(args.output,args.pg_dump)
