"""Fixed owned Local, exact-candidate, live READ ONLY functional preflight."""
import hashlib, json, os, re, stat, subprocess, sys, urllib.parse
from pathlib import Path
from linux_runtime_common import require_linux, verify_local_profile, host_listeners, private_json
RUNTIME = Path(__file__).resolve().parent
SOURCE = RUNTIME.parent.parent/'colorplay-live-recovery'
PROJECT = 'cp-whole-site-261115'
ENV = {'PATH':'/usr/bin:/bin','PYTHONDONTWRITEBYTECODE':'1'}
TABLES = {'auth':'auth.users','profiles':'public.profiles','classrooms':'public.classrooms','xp':'public.xp_transactions','wallet':'public.wallet_transactions','mediaRuns':'public.content_media_upload_runs','mediaAssets':'public.content_media_assets'}
SQL = "begin read only; set local statement_timeout='10s'; select json_build_object('systemIdentifier',(select system_identifier::text from pg_control_system()),'baseline',json_build_object('migrations',(select count(*) from supabase_migrations.schema_migrations),'publicTables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),'publicWithoutRls',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity)," + ','.join("'%s',(select count(*) from %s)" % item for item in TABLES.items()) + ')); rollback;'

def private_read(path):
    return private_json(path,131072)[0]

def command(args,env=ENV,data=None,timeout=10):
    process=subprocess.run(args,input=data,env=env,capture_output=True,text=True,timeout=timeout)
    assert process.returncode==0,'READ_ONLY_COMMAND_FAILED'
    assert len(process.stdout.encode())<=131072,'OUTPUT_TOO_LARGE'
    return process.stdout

def revision():
    head=command(['/usr/bin/git','rev-parse','HEAD'],env=ENV_SOURCE)
    clean=command(['/usr/bin/git','status','--porcelain'],env=ENV_SOURCE)
    assert not clean.strip(),'SOURCE_NOT_FROZEN'
    return head.strip()

# Git's explicit work-tree/git-dir avoid ambient repository discovery. No shell.
ENV_SOURCE={**ENV,'GIT_DIR':str(SOURCE/'.git'),'GIT_WORK_TREE':str(SOURCE)}

def target(owner,state):
    assert owner['projectId']==PROJECT and owner['apiUrl']==state['API_URL']=='http://127.0.0.1:58321','API_TARGET_INVALID'
    url=urllib.parse.urlsplit(state['DB_URL'])
    assert url.scheme in ('postgres','postgresql') and url.hostname=='127.0.0.1' and url.port==58322 and url.path=='/postgres' and not url.query and not url.fragment and url.username and url.password,'DATABASE_TARGET_INVALID'
    return url


def database(url):
    env={**ENV,'PGHOST':'127.0.0.1','PGPORT':'58322','PGDATABASE':'postgres','PGUSER':urllib.parse.unquote(url.username),'PGPASSWORD':urllib.parse.unquote(url.password),'PGSSLMODE':'disable','PGCONNECT_TIMEOUT':'5','PGOPTIONS':'-c default_transaction_read_only=on'}
    body=command([str(RUNTIME.parent/'host-client/bin/psql'),'--no-psqlrc','--quiet','--tuples-only','--no-align','--set=ON_ERROR_STOP=1'],env=env,data=SQL,timeout=15)
    return json.loads(body)

def snapshot(value,expected_identifier):
    assert set(value)=={'systemIdentifier','baseline'} and value['systemIdentifier']==expected_identifier and re.fullmatch('[0-9]{1,24}',value['systemIdentifier']),'DATABASE_IDENTITY_INVALID'
    expected={'migrations':122,'publicTables':71,'publicWithoutRls':0,**{key:0 for key in TABLES}}
    assert set(value['baseline'])==set(expected),'BASELINE_SHAPE_INVALID'
    assert all(type(value['baseline'][key]) is int and value['baseline'][key]==count for key,count in expected.items()),'FRESH_BASELINE_INVALID'
    return {'baseline':value['baseline'],'databaseIdentity':PROJECT+':'+value['systemIdentifier']+':postgres'}

def main():
    require_linux()
    assert len(sys.argv)==3,'REVISION_AND_RUN_REQUIRED'
    sha,run_id=sys.argv[1:]
    assert re.fullmatch('[a-f0-9]{40}',sha) and re.fullmatch('[a-z0-9][a-z0-9-]{5,59}',run_id),'ARGUMENT_INVALID'
    review=private_read(RUNTIME/'reviewed-candidate.json')
    assert review['result']=='ACCEPTED_FOR_LOCAL_VALIDATION' and review['sourceRevision']==sha and revision()==sha,'REVIEWED_REVISION_MISMATCH'
    owner=private_read(RUNTIME/'ownership.json');state=private_read(RUNTIME/'status-secret.json');url=target(owner,state)
    _,profile,_=verify_local_profile(sha,review['executionProfileSha256'],full=True)
    host_listeners()
    observed=database(url)
    assert hashlib.sha256((PROJECT+':'+observed['systemIdentifier']+':postgres').encode()).hexdigest()==profile['identity']['databaseIdentitySha256'],'DATABASE_PROFILE_CHANGED'
    result=snapshot(observed,observed['systemIdentifier'])
    assert revision()==sha,'SOURCE_CHANGED_DURING_READ'
    path=RUNTIME/('functional-preflight-'+run_id+'.json')
    with path.open('x') as stream:
        os.chmod(stream.name,0o600);json.dump({'sourceRevision':sha,'runId':run_id,'readOnly':True,'querySha256':hashlib.sha256(SQL.encode()).hexdigest(),'loopbackVerified':True,**result},stream,indent=2);stream.write('\n')
    print(json.dumps(result))
if __name__=='__main__':
    try:main()
    except Exception as error:
        print(json.dumps({'result':'FUNCTIONAL_PREFLIGHT_BLOCKED','errorClass':type(error).__name__,'rawLogsStored':False}));raise SystemExit(1) from None
