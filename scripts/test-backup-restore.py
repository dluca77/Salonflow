"""Restore an encrypted backup into a NEW loopback-only PostgreSQL cluster.
Never accepts a remote DB URL. Runs permission/booking regression suites locally.
Requires a full PostgreSQL installation (initdb, pg_ctl, psql) and cryptography.
"""
import os,json,subprocess,tempfile,secrets,zipfile,io,hashlib,argparse,socket,time
from pathlib import Path
from cryptography.fernet import Fernet

def ident(s):return '"'+s.replace('"','""')+'"'
def literal(s):return "'"+s.replace("'","''")+"'"
def restore(backup,binpath,workroot):
    z=zipfile.ZipFile(io.BytesIO(Fernet(os.environ['KRONR_BACKUP_KEY'].encode()).decrypt(Path(backup).read_bytes())))
    manifest=json.loads(z.read('manifest.json'));tables=json.loads(z.read('data.json'))
    root=Path(workroot).resolve();root.mkdir(parents=True,exist_ok=True)
    started=False; begin=time.monotonic()
    with tempfile.TemporaryDirectory(prefix='isolated-restore-',dir=root) as directory:
        work=Path(directory); data=work/'pgdata';pw=secrets.token_urlsafe(36);pwfile=work/'password';pwfile.write_text(pw)
        env=dict(os.environ,PGPASSWORD=pw,PGOPTIONS="-c timezone=UTC")
        def run(tool,args):
            with (work/'stdout.log').open('wb') as out, (work/'stderr.log').open('wb') as err:
                r=subprocess.run([str(Path(binpath)/tool)]+args,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=err)
            r.stdout=(work/'stdout.log').read_bytes();r.stderr=(work/'stderr.log').read_bytes()
            if r.returncode:
                # Keep detailed database errors private; they may contain data.
                details=r.stderr+r.stdout+((work/'server.log').read_bytes() if (work/'server.log').exists() else b'')
                (root/'last-restore-error.txt').write_bytes(details)
                (root/'restore-diagnostics.fernet').write_bytes(Fernet(os.environ['KRONR_BACKUP_KEY'].encode()).encrypt(details))
                raise RuntimeError(tool+' failed; private last-restore-error.txt contains details')
            return r.stdout
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        try:
            run('initdb',['-D',str(data),'-U','postgres','--auth=scram-sha-256','--pwfile',str(pwfile),'--encoding=UTF8','--locale=C'])
            with (data/'postgresql.conf').open('a') as f:f.write("\nlisten_addresses='127.0.0.1'\nunix_socket_directories=''\nport="+str(port)+"\n")
            run('pg_ctl',['-D',str(data),'-l',str(work/'server.log'),'-w','start']);started=True
            base=['-h','127.0.0.1','-p',str(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-X','-q']
            def sql(text):
                f=work/'input.sql';f.write_text(text,encoding='utf-8');return run('psql',base+['-f',str(f)])
            roles=json.loads(z.read('roles.json'))
            sql('\n'.join('create role '+ident(r['rolname'])+' nologin '+('bypassrls' if r['rolbypassrls'] else 'nobypassrls')+';' for r in roles if r['rolname']!='postgres'))
            sql('drop schema public;')
            sql(z.read('schema.sql').decode())
            columns=json.loads(z.read('columns.json'));inserts=['begin;set local session_replication_role=replica;']
            for t in tables:
                if not t['rows']:continue
                schema,name=t['name'].split('.',1);table=ident(schema)+'.'+ident(name)
                cols=','.join(ident(c['column_name']) for c in columns if c['table_schema']==schema and c['table_name']==name and c['is_generated']=='NEVER')
                inserts.append('insert into '+table+' ('+cols+') overriding system value select '+cols+' from json_populate_recordset(null::'+table+','+literal(json.dumps(t['rows']))+');')
            for s in json.loads(z.read('sequences.json')):
                if s['last_value'] is not None:inserts.append('select setval('+literal(ident(s['schemaname'])+'.'+ident(s['sequencename']))+','+str(s['last_value'])+',true);')
            inserts.append('commit;');sql('\n'.join(inserts))
            # Canonical jsonb equality verifies every restored row, not only counts.
            checks=[]
            for t in tables:
                schema,name=t['name'].split('.',1);table=ident(schema)+'.'+ident(name)
                checks.append('if exists ((select to_jsonb(t) from '+table+' t except all select value from jsonb_array_elements('+literal(json.dumps(t['rows']))+'::jsonb)) union all (select value from jsonb_array_elements('+literal(json.dumps(t['rows']))+'::jsonb) except all select to_jsonb(t) from '+table+' t)) then raise exception '+literal('Restored data mismatch: '+t['name'])+';end if;')
            sql('do $restore_check$ begin '+'\n'.join(checks)+' end $restore_check$;')
            for obj in json.loads(z.read('storage-manifest.json')):
                restored_file=work/('object-'+str(len(obj['file']))+'-'+hashlib.sha256(obj['file'].encode()).hexdigest())
                restored_file.write_bytes(z.read(obj['file']))
                assert hashlib.sha256(restored_file.read_bytes()).hexdigest()==obj['sha256']
            import re
            tests=Path(__file__).resolve().parent.parent/'tests';passed=[]
            for test in sorted(tests.glob('*.sql')):
                text=test.read_text(encoding='utf-8-sig')
                if not re.search(r'^\s*begin\s*;',text,re.I|re.M):text='begin;\n'+text
                if not re.search(r'^\s*rollback\s*;',text,re.I|re.M):text+='\nreset role;rollback;'
                sql(text);passed.append(test.name)
            result={'backup_utc':manifest['created_utc'],'tables_verified':len(tables),'rows_verified':sum(manifest['counts'].values()),'storage_files_verified':manifest['objects'],'sql_suites':passed,'seconds':round(time.monotonic()-begin,1),'target':'isolated localhost PostgreSQL','auth_service_tested':False}
            (root/'last-restore-error.txt').unlink(missing_ok=True)
            report=root/'restore-report.json';report.write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
        finally:
            if started:run('pg_ctl',['-D',str(data),'-m','fast','-w','stop'])

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('backup');p.add_argument('--bin',required=True);p.add_argument('--workroot',required=True)
    args=p.parse_args();restore(args.backup,args.bin,args.workroot)
