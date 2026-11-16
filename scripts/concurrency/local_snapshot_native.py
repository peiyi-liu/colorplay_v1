"""Fixed Linux-only external ports. No shell, arbitrary targets, or cleanup."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import select
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.parse
import local_snapshot_contracts as C

DOCKER = ['/usr/bin/docker', '--host', 'unix:///var/run/docker.sock']
ENV = {'PATH':'/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE':'1'}
SOURCE = Path(__file__).resolve().parents[2]
VOLUME_CENSUS = r'''import os,sys,stat,json,hashlib
root=sys.argv[1];assert os.path.realpath(root)==root
rows=[];total=0
def inaccessible(error):raise error
for parent,dirs,files in os.walk(root,followlinks=False,onerror=inaccessible):
 for name in sorted(dirs+files):
  p=os.path.join(parent,name);s=os.lstat(p);assert not stat.S_ISLNK(s.st_mode)
  assert stat.S_ISDIR(s.st_mode) or (stat.S_ISREG(s.st_mode) and s.st_nlink==1)
  row={'path':os.path.relpath(p,root),'mode':stat.S_IMODE(s.st_mode),'uid':s.st_uid,'gid':s.st_gid,'inode':s.st_ino,'device':s.st_dev,'bytes':s.st_size,'directory':stat.S_ISDIR(s.st_mode)}
  if not row['directory']:
   h=hashlib.sha256();f=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
   with os.fdopen(f,'rb') as stream:
    before=os.fstat(stream.fileno())
    while chunk:=stream.read(65536):h.update(chunk)
    after=os.fstat(stream.fileno())
   fields=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mode,x.st_uid,x.st_gid,x.st_mtime_ns,x.st_ctime_ns)
   assert fields(s)==fields(before)==fields(after)==fields(os.lstat(p))
   row['sha256']=h.hexdigest();total+=s.st_size;assert total<=2147483648
  rows.append(row);assert len(rows)<=20000
print(json.dumps(sorted(rows,key=lambda x:x['path'])))
'''
WRITERS = r'''import os,sys,json
root,backend=sys.argv[1:];unknown=False;writers=0
for pid in os.listdir('/proc'):
 if not pid.isdecimal():continue
 try:
  group=open('/proc/'+pid+'/cgroup').read().strip()
  if group.startswith('0::'+backend+'/'):continue
  for fd in os.listdir('/proc/'+pid+'/fd'):
   target=os.readlink('/proc/'+pid+'/fd/'+fd)
   if target==root or target.startswith(root+'/'):
    values=dict(line.split(':',1) for line in open('/proc/'+pid+'/fdinfo/'+fd) if ':' in line)
    if int(values['flags'].strip(),8)&os.O_ACCMODE in (os.O_WRONLY,os.O_RDWR):writers+=1
 except FileNotFoundError:continue
 except (PermissionError,KeyError,ValueError,ProcessLookupError):unknown=True
print(json.dumps({'writers':writers,'unknown':unknown}))
'''
MAIL_GET = r'''import sys,urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):raise RuntimeError('REDIRECT_REJECTED')
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
request=urllib.request.Request('http://127.0.0.1:58324'+sys.argv[1],method='GET')
with opener.open(request,timeout=5) as response:
 assert response.status==200
 count=0
 while chunk:=response.read(65536):
  count+=len(chunk);assert count<=52428800
  sys.stdout.buffer.write(chunk)
'''


class NativeIO:
    def __init__(self):
        self.source, self.environment, self.platform = SOURCE, dict(os.environ), sys.platform
        self.runtime = SOURCE.parent / 'live-recovery-runtime/whole-site-261115'
        self.deadline, self.closure, self.cancelled = time.monotonic() + 600, 'VERIFIED', False

    def check(self):
        C.require(not self.cancelled,'SNAPSHOT_INTERRUPTED')
        C.require(time.monotonic() < self.deadline, 'SNAPSHOT_DEADLINE')

    def run(self, args, *, data=None, output=None, env=None, timeout=30, maximum=8*1024**2):
        self.check()
        seconds = min(timeout, self.deadline - time.monotonic() - 4)
        C.require(seconds > 0, 'SNAPSHOT_DEADLINE')
        privileged = args[:2] == ['/usr/bin/sudo', '-n']
        if privileged:
            args = [*args[:2], '/usr/bin/timeout', '--signal=TERM', '--kill-after=2', str(seconds), *args[2:]]
        started = time.monotonic()
        incoming = tempfile.TemporaryFile()
        incoming.write(data or b''); incoming.seek(0)
        fd = os.open(output, os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600) if output else None
        destination = os.fdopen(fd,'wb') if fd is not None else tempfile.TemporaryFile()
        child = None
        try:
            child = subprocess.Popen(args,cwd=self.source,env={**ENV,**(env or {})},stdin=incoming,
                stdout=destination,stderr=subprocess.DEVNULL,start_new_session=True)
            while child.poll() is None:
                self.check()
                C.require(time.monotonic()-started < seconds+3, 'SNAPSHOT_COMMAND_TIMEOUT')
                C.require(os.fstat(destination.fileno()).st_size <= (C.LIMIT if output else maximum), 'SNAPSHOT_SIZE_LIMIT')
                time.sleep(0.02)
            C.require(child.returncode == 0, 'SNAPSHOT_COMMAND_FAILED')
            destination.flush(); os.fsync(destination.fileno())
            size = os.fstat(destination.fileno()).st_size
            C.require(size <= (C.LIMIT if output else maximum), 'SNAPSHOT_SIZE_LIMIT')
            if output:return None
            destination.seek(0); return destination.read(maximum+1)
        finally:
            if child is not None and child.poll() is None:
                try:os.killpg(child.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                except PermissionError:self.closure='UNKNOWN'
                try:child.wait(timeout=3)
                except subprocess.TimeoutExpired:self.closure='UNKNOWN'
                if privileged:self.closure='UNKNOWN'
            destination.close(); incoming.close()

    def docker(self, *args, **options):
        return self.run([*DOCKER,*args],**options)

    def frozen(self, plan):
        C.require(self.platform=='linux' and platform.machine() in {'x86_64','amd64'},'SNAPSHOT_LINUX_REQUIRED')
        values=dict(line.split('=',1) for line in Path('/etc/os-release').read_text().splitlines() if '=' in line)
        C.require(values.get('ID','').strip('"')=='ubuntu' and values.get('VERSION_ID','').strip('"')=='24.04')
        C.require(self.run(['/usr/bin/git','rev-parse','HEAD']).decode().strip()==plan['sourceRevision'] and
                  not self.run(['/usr/bin/git','status','--porcelain']).strip(),'SNAPSHOT_SOURCE_CHANGED')
        C.require(not os.path.lexists(self.source/'supabase/.temp/project-ref') and
                  not any(p.name!='.env.example' for p in self.source.glob('.env*')))

    def load_root(self):
        before=list(sys.path);sys.dont_write_bytecode=True
        try:
            sys.path.insert(0,str(self.runtime))
            spec=importlib.util.spec_from_file_location('snapshot_approved_root',self.runtime/'linux_runtime_common.py')
            module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        finally:sys.path[:]=before
        return module

    def boot(self):
        value=Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        return C.digest(value.encode())

    def process(self, pin):
        pid=pin['pid'];root=Path('/proc')/str(pid)
        fd=os.pidfd_open(pid)
        try:
            raw=(root/'stat').read_text();parts=raw[raw.rfind(')')+2:].split()
            uid=int(next(line.split()[1] for line in (root/'status').read_text().splitlines() if line.startswith('Uid:')))
            executable=(root/'exe').resolve(strict=True)
            C.require(int(parts[19])==pin['startTicks'] and uid==pin['uid']==os.getuid() and
                      str(executable)==pin['executablePath'] and C.binary_hash(executable)==pin['executableSha256'] and
                      self.boot()==pin['hostBootIdSha256'] and pid!=os.getpid(),'SNAPSHOT_PREVIEW_CHANGED')
            return fd
        except BaseException:os.close(fd);raise

    def observe(self, plan, context, profile):
        self.context=context;self.profile=profile
        root=self.load_root()
        root.validate_context(context)
        C.require({'schemaVersion':1,'kind':'LINUX_FREE_4CPU_16G_V1',**root.observe_profile(context,allow_outside_group=True)}==profile,
                  'SNAPSHOT_PROFILE_CHANGED')
        fd=self.process(plan['preview']);os.close(fd)
        self.barrier(plan,context)
        rows=C.decode(self.docker('inspect',*[r['id'] for r in plan['containers']]))
        names=self.docker('volume','ls','-q').decode().split()
        volumes=C.decode(self.docker('volume','inspect',*names)) if names else []
        all_ids=self.docker('ps','-aq','--no-trunc').decode().split()
        docker_root=self.docker('info','--format','{{.DockerRootDir}}').decode().strip()
        return {'containers':rows,'volumes':volumes,'allContainerIds':all_ids,'dockerRoot':docker_root,'boot':self.boot()}

    def barrier(self, plan, context):
        self.check()
        C.require(self.boot()==plan['preview']['hostBootIdSha256'],'SNAPSHOT_BOOT_CHANGED')
        group=Path('/sys/fs/cgroup')/context['generatorCgroupRelativePath'].lstrip('/')
        C.require(group.resolve(strict=True)==group and all(not (Path(p)/'cgroup.procs').read_text().strip()
                  for p,_,_ in os.walk(group)),
                  'SNAPSHOT_GENERATOR_NOT_EMPTY')
        result=C.decode(self.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',WRITERS,
            str(self.runtime),context['backendCgroupRelativePath']]))
        C.require(result=={'writers':0,'unknown':False},'SNAPSHOT_WRITERS_NOT_SETTLED')

    def stop_preview(self, pin):
        fd=self.process(pin)
        try:
            signal.pidfd_send_signal(fd,signal.SIGTERM)
            ready,_,_=select.select([fd],[],[],min(30,self.deadline-time.monotonic()))
            C.require(bool(ready),'SNAPSHOT_PREVIEW_STOP_UNKNOWN')
        finally:os.close(fd)

    def get(self, target):
        import re
        C.require(re.fullmatch(r'/api/v1/messages\?start=[0-9]{1,6}&limit=50|/api/v1/message/[A-Za-z0-9_-]{1,80}/raw',target))
        C.require('/message/latest/' not in target)
        return self.run(['/usr/bin/python3','-B','-c',MAIL_GET,target],timeout=15,maximum=50*1024**2)

    def inspect(self, rows):
        return C.decode(self.docker('inspect',*[r['id'] for r in rows]))

    def stop(self, row):
        self.docker('stop','--timeout','-1',row['id'],timeout=90)

    def database(self, plan):
        self.db=next(row['id'] for row in plan['containers'] if row['role']=='db')
        state=C.decode(C.read_file(self.runtime/'status-secret.json',private=True))
        target=urllib.parse.urlsplit(state['DB_URL'])
        C.require(target.scheme in {'postgres','postgresql'} and target.hostname=='127.0.0.1' and target.port==58322 and
                  target.username=='postgres' and target.path=='/postgres' and target.password and not target.query and not target.fragment)
        self.pg_env={'PGPASSWORD':urllib.parse.unquote(target.password),'PGOPTIONS':'-c default_transaction_read_only=on'}
        return self.sql('postgres',"select coalesce(json_agg(datname order by datname),'[]') from pg_database where not datistemplate;")

    def sql(self, database, query):
        args=['exec','-i','--env','PGPASSWORD','--env','PGOPTIONS',self.db,'psql','-X','-q','-t','-A','-w',
              '--host','127.0.0.1','--port','5432','--username','postgres','--dbname',database,'--set','ON_ERROR_STOP=1']
        return C.decode(self.docker(*args,data=("begin read only;set local statement_timeout='10s';"+query+'rollback;').encode(),env=self.pg_env).strip())

    def census(self, databases):
        result={'clusterRoles':self.sql('postgres',"select json_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(r)::text,chr(10) order by to_jsonb(r)::text),''),'UTF8')),'hex')) from pg_authid r;")}
        for database in databases:
            tables=self.sql(database,"select coalesce(json_agg(json_build_array(n.nspname,c.relname) order by n.nspname,c.relname),'[]') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and left(n.nspname,3)<>'pg_' and n.nspname<>'information_schema';")
            C.require(type(tables)is list and len(tables)<=256)
            queries=[]
            for schema,table in tables:
                import re
                C.require(all(isinstance(v,str) and re.fullmatch('[A-Za-z_][A-Za-z0-9_]{0,62}',v) for v in [schema,table]))
                queries.append("select json_build_object('schema','%s','table','%s','count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,chr(10) order by to_jsonb(t)::text),''),'UTF8')),'hex')) from \"%s\".\"%s\" t"%(schema,table,schema,table))
            result[database]=self.sql(database,'select coalesce(json_agg(v),\'[]\') from ('+' union all '.join(queries)+') q(v);') if queries else []
        return result

    def dump(self, database, target):
        program='pg_dumpall' if database is None else 'pg_dump'
        args=['exec','--env','PGPASSWORD','--env','PGOPTIONS',self.db,program,'--host','127.0.0.1',
              '--port','5432','--username','postgres','--no-password']
        args+=['--globals-only'] if database is None else ['--format=custom','--dbname',database]
        self.docker(*args,output=target,env=self.pg_env,timeout=90)

    def database_files(self, directory):
        for name in ['postgresql','postgresql-custom']:
            self.docker('cp',self.db+':/etc/'+name,'-',output=directory/(name+'.tar'),timeout=30)
        key=directory/'pgsodium_root.key'
        self.docker('exec',self.db,'cat','/etc/postgresql-custom/pgsodium_root.key',output=key)
        C.require(0<key.stat().st_size<=4096,'SNAPSHOT_VAULT_KEY_MISSING')

    def volume(self, mount, target):
        source=mount['source']
        before=self.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',VOLUME_CENSUS,source],timeout=60)
        self.run(['/usr/bin/sudo','-n','/usr/bin/tar','--format=pax','--numeric-owner','--acls','--xattrs','--sparse',
                  '--create','--file=-','--directory',source,'.'],output=target,timeout=90)
        after=self.run(['/usr/bin/sudo','-n','/usr/bin/python3','-B','-c',VOLUME_CENSUS,source],timeout=60)
        C.require(before==after,'SNAPSHOT_VOLUME_CHANGED')
        return C.decode(before)
