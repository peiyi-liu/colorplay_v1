"""Read-only Source config closure; fixed anchors, no env/globs/external inputs."""
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tomllib
from linux_bootstrap_contracts import require, read_file, digest, write_once, BootstrapError, fingerprint

CODE='BOOTSTRAP_PROJECT_INPUT_INVALID'
SEEDS=['seed.sql','seeds/content-questions.sql','seeds/content-review-cards.sql','seeds/content-question-hints.sql']
TEMPLATES={'auth.email.template.magic_link.content_path','auth.email.template.confirmation.content_path'}
NON_FILES={'api.extra_search_path':'DB_SCHEMA_SEARCH_PATH','auth.oauth_server.authorization_url_path':'URL_ROUTE'}
GENERATED=[{'key':'auth.signing_keys_path','anchor':'SUPABASE_DIR','value':'./signing-keys.json','path':'supabase/signing-keys.json'}]
PUBLIC_TEMPLATE='supabase/templates/email-otp.html'


def public_template(row):
    if row['path']!=PUBLIC_TEMPLATE:return False
    require(row['references']==[{'key':key,'anchor':'PROJECT_ROOT','value':'./'+PUBLIC_TEMPLATE}
                                for key in sorted(TEMPLATES)],CODE)
    return True


def publish_template(path,row):
    """Only the pinned public HTML gets readable mode; no directory/Source changes."""
    require(public_template(row),CODE)
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        before=os.fstat(fd)
        require(stat.S_ISREG(before.st_mode) and before.st_uid==os.getuid() and
                before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and
                before.st_size==row['bytes']<=16*1024**2,CODE)
        with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(row['bytes']+1)
        require(len(raw)==row['bytes'] and digest(raw)==row['sha256'] and
                fingerprint(os.fstat(fd))==fingerprint(before) and
                fingerprint(path.stat(follow_symlinks=False))==fingerprint(before),CODE)
        os.fchmod(fd,0o444)
        os.fsync(fd)
        after=os.fstat(fd)
        require((before.st_dev,before.st_ino,before.st_uid,before.st_nlink,before.st_size)==
                (after.st_dev,after.st_ino,after.st_uid,after.st_nlink,after.st_size) and
                stat.S_IMODE(after.st_mode)==0o444 and
                fingerprint(path.stat(follow_symlinks=False))==fingerprint(after),CODE)
    finally:os.close(fd)


def proof_sha256(proof):
    return digest(json.dumps(proof,sort_keys=True,separators=(',',':')).encode())


def leaves(value,prefix=''):
    for key,item in value.items():
        name=prefix+'.'+key if prefix else key
        if type(item) is dict:yield from leaves(item,name)
        else:yield name,item


def relative_input(value,anchor):
    require(isinstance(value,str) and value.startswith('./') and
            re.fullmatch(r'\./[A-Za-z0-9_./-]+',value) is not None,CODE)
    parts=PurePosixPath(value[2:]).parts
    require(parts and '..' not in parts and '.' not in parts and value[2:]=='/'.join(parts),CODE)
    name=('/'.join(parts) if anchor=='PROJECT_ROOT' else 'supabase/'+'/'.join(parts))
    require(name.startswith('supabase/') and not any(p.startswith('.env') for p in parts),CODE)
    return name


def capture_project_inputs(source,tracked):
    """Only read a clean, externally source-pinned checkout; no writes or commands."""
    source=Path(source)
    try:
        require(source.is_absolute() and source.resolve()==source,CODE)
        require(type(tracked) is list and all(isinstance(p,str) for p in tracked) and
                len(tracked)==len(set(tracked)),CODE)
        require('supabase/config.toml' in tracked,CODE)
        raw=read_file(source/'supabase/config.toml')
        config=tomllib.loads(raw.decode())
        values=dict(leaves(config))
        require(values.get('db.seed.sql_paths')==['./'+p for p in SEEDS] and
                values.get('db.migrations.schema_paths')==[],CODE)
        dependencies={}
        def add(key,value,anchor):
            path=relative_input(value,anchor)
            if key in TEMPLATES:require(path=='supabase/templates/email-otp.html',CODE)
            require(path in tracked,CODE)
            body=read_file(source/path,16*1024**2)
            row=dependencies.setdefault(path,{'path':path,'sha256':digest(body),'bytes':len(body),'references':[]})
            require(row['sha256']==digest(body),CODE)
            row['references'].append({'key':key,'anchor':anchor,'value':value})
        non_files=[]
        for key,value in sorted(values.items()):
            if key in NON_FILES:
                non_files.append({'key':key,'kind':NON_FILES[key]})
            elif key=='db.seed.sql_paths':
                for item in value:add(key,item,'SUPABASE_DIR')
            elif key=='db.migrations.schema_paths':
                require(value==[],CODE)  # Nonempty/glob schema inputs are unsupported here.
            elif key in TEMPLATES:
                add(key,value,'PROJECT_ROOT')
            elif key.endswith(('_path','_paths','_file','_files')) or key.rsplit('.',1)[-1] in {'entrypoint','import_map','static_files'}:
                require(False,CODE)
        require(TEMPLATES<=set(values),CODE)
        require(digest(read_file(source/'supabase/config.toml'))==digest(raw),CODE)
        for row in dependencies.values():
            require(digest(read_file(source/row['path'],16*1024**2))==row['sha256'],CODE)
        for row in dependencies.values():row['references'].sort(key=lambda r:(r['key'],r['value']))
        return {'schemaVersion':1,'config':{'path':'supabase/config.toml','sha256':digest(raw)},
                'dependencies':[dependencies[p] for p in sorted(dependencies)],
                'generated':[dict(row) for row in GENERATED],'nonFileReferences':non_files}
    except Exception:
        raise BootstrapError(CODE) from None


def verify_project_inputs(source,tracked,proof,expected):
    require(proof_sha256(proof)==expected and capture_project_inputs(source,tracked)==proof,CODE)


def verify_copied_inputs(project,proof):
    for row in proof['dependencies']:
        path=Path(project)/row['path'];public=public_template(row)
        before=path.stat(follow_symlinks=False)
        raw=read_file(path,16*1024**2,private=not public)
        require(stat.S_IMODE(before.st_mode)==(0o444 if public else 0o600) and
                fingerprint(path.stat(follow_symlinks=False))==fingerprint(before),CODE)
        require(digest(raw)==row['sha256'] and len(raw)==row['bytes'],CODE)


def copy_project_inputs(source,project,tracked,proof,expected):
    """Consume the pre-mutation pin; don't derive new authority while copying."""
    verify_project_inputs(source,tracked,proof,expected)
    for row in proof['dependencies']:
        body=read_file(Path(source)/row['path'],16*1024**2)
        require(digest(body)==row['sha256'] and len(body)==row['bytes'],CODE)
        target=Path(project)/row['path'];parent=Path(project)
        for component in target.relative_to(project).parts[:-1]:
            parent=parent/component;parent.mkdir(mode=0o700,exist_ok=True)
        write_once(target,body)
        if public_template(row):publish_template(target,row)
        require(digest(read_file(target,16*1024**2,private=not public_template(row)))==row['sha256'],CODE)
    verify_project_inputs(source,tracked,proof,expected)
    verify_copied_inputs(project,proof)
