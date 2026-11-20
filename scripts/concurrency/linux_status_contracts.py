"""Fixed Linux bootstrap observations, private-file crypto and safe public schema."""
import base64
import json
from pathlib import Path
import re
import urllib.parse
import linux_bootstrap_contracts as C

FIELDS=('API_URL','DB_URL','JWT_SECRET','ANON_KEY','SERVICE_ROLE_KEY')
DB_FLAGS=('scheme','host','port','database','user','password','query','fragment')
TOKEN_KEYS={'partsCount','alg','roleMatch','ownedKidMatch','signature'}
ALG={'ES256','HS256','RS256','NONE','OTHER','UNKNOWN'}
SIGNATURE={'VALID','INVALID','UNKNOWN','NOT_RUN'}
NODE_TOKEN_VERIFY="""const fs=require('node:fs'),c=require('node:crypto');let out={anon:'UNKNOWN',serviceRole:'UNKNOWN'};try{const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8')),keys=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));const key=c.createPublicKey(c.createPrivateKey({key:keys[0],format:'jwk'}));for(const [name,field] of [['anon','ANON_KEY'],['serviceRole','SERVICE_ROLE_KEY']]){try{const parts=s[field].split('.');if(parts.length!==3||JSON.parse(Buffer.from(parts[0],'base64url')).alg!=='ES256'){out[name]='NOT_RUN';continue;}const sig=Buffer.from(parts[2],'base64url');if(sig.length!==64||sig.toString('base64url')!==parts[2]){out[name]='INVALID';continue;}out[name]=c.verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key,dsaEncoding:'ieee-p1363'},sig)?'VALID':'INVALID';}catch{out[name]='INVALID';}}}catch{}process.stdout.write(JSON.stringify(out));"""


def nullable_bool(value):return value is None or type(value) is bool

def token_observation(value,role,kid):
    result={'partsCount':None,'alg':'UNKNOWN','roleMatch':None,'ownedKidMatch':None,'signature':'NOT_RUN'}
    if not isinstance(value,str) or len(value)>32768:return result
    parts=value.split('.');result['partsCount']=len(parts) if len(parts)<=64 else None
    if len(parts)!=3:return result
    try:
        def unpack(part):
            C.require(re.fullmatch('[A-Za-z0-9_-]+',part) is not None)
            raw=base64.urlsafe_b64decode(part+'='*(-len(part)%4))
            C.require(base64.urlsafe_b64encode(raw).rstrip(b'=').decode()==part)
            data=C.decode(raw);C.require(type(data) is dict);return data
        header,payload=unpack(parts[0]),unpack(parts[1])
        alg=header.get('alg');result['alg']=alg if alg in {'ES256','HS256','RS256'} else 'NONE' if alg=='none' else 'OTHER'
        result['roleMatch']=payload.get('role')==role
        result['ownedKidMatch']=header.get('kid')==kid
    except Exception:pass
    return result


def observe_status(raw,secret,key):
    try:state=C.decode(raw);state=state if type(state) is dict else None
    except Exception:state=None
    proof={'schemaVersion':1,'rawStatusSha256':C.digest(raw),'shape':'OBJECT' if state is not None else 'INVALID',
           'fields':{name:'UNAVAILABLE' if state is None else 'MISSING' if name not in state else 'STRING' if isinstance(state[name],str) else 'OTHER' for name in FIELDS},
           'apiExact':None,'hmacMatch':None,'tokensDistinct':None,'db':dict.fromkeys(DB_FLAGS),
           'tokens':{'anon':token_observation(None,'anon',key['kid']),'serviceRole':token_observation(None,'service_role',key['kid'])}}
    if state is None:return state,proof
    for name,field in [('apiExact','API_URL'),('hmacMatch','JWT_SECRET')]:
        if isinstance(state.get(field),str):proof[name]=state[field]==('http://127.0.0.1:58321' if name=='apiExact' else secret)
    if all(isinstance(state.get(k),str) for k in ['ANON_KEY','SERVICE_ROLE_KEY']):proof['tokensDistinct']=state['ANON_KEY']!=state['SERVICE_ROLE_KEY']
    if isinstance(state.get('DB_URL'),str):
        try:
            u=urllib.parse.urlsplit(state['DB_URL'])
            proof['db']={'scheme':u.scheme in {'postgres','postgresql'},'host':u.hostname=='127.0.0.1','port':u.port==58322,
                         'database':u.path=='/postgres','user':u.username=='postgres','password':bool(u.password),'query':not u.query,'fragment':not u.fragment}
        except Exception:pass
    proof['tokens']={name:token_observation(state.get(field),role,key['kid']) for name,field,role in [('anon','ANON_KEY','anon'),('serviceRole','SERVICE_ROLE_KEY','service_role')]}
    return state,proof


def verify_signatures(io,runtime,node,key,proof):
    status=Path(runtime)/'status-secret.json';keys=Path(runtime)/'local-project/supabase/signing-keys.json'
    try:
        before={p:C.read_file(p,private=True) for p in [status,keys]}
        C.require(C.digest(before[status])==proof['rawStatusSha256'] and C.decode(before[keys])==[key])
        result=C.decode(io.run([node,'-e',NODE_TOKEN_VERIFY,str(status),str(keys)],maximum=16384))
        C.require(type(result) is dict and set(result)=={'anon','serviceRole'} and all(isinstance(v,str) and v in SIGNATURE for v in result.values()))
        C.require(all(C.read_file(p,private=True)==raw for p,raw in before.items()))
    except Exception:result={'anon':'UNKNOWN','serviceRole':'UNKNOWN'}
    for name in result:proof['tokens'][name]['signature']=result[name]


def require_status(proof):
    C.require(proof['shape']=='OBJECT' and all(v=='STRING' for v in proof['fields'].values()) and
              all(proof[k] is True for k in ['apiExact','hmacMatch','tokensDistinct']) and all(v is True for v in proof['db'].values()),'BOOTSTRAP_STATUS_INVALID')
    C.require(all(t['partsCount']==3 and t['alg']=='ES256' and t['roleMatch'] is True and t['ownedKidMatch'] is True and t['signature']=='VALID' for t in proof['tokens'].values()),'BOOTSTRAP_TOKEN_SIGNATURE_INVALID')


def safe_status(proof):
    try:
        C.require(type(proof) is dict and set(proof)=={'schemaVersion','rawStatusSha256','shape','fields','apiExact','hmacMatch','tokensDistinct','db','tokens'})
        C.require(type(proof['schemaVersion']) is int and proof['schemaVersion']==1 and isinstance(proof['rawStatusSha256'],str) and re.fullmatch('[a-f0-9]{64}',proof['rawStatusSha256']))
        C.require(proof['shape'] in {'OBJECT','INVALID'} and type(proof['fields']) is dict and set(proof['fields'])==set(FIELDS))
        C.require(all(isinstance(v,str) and v in {'STRING','MISSING','OTHER','UNAVAILABLE'} for v in proof['fields'].values()))
        C.require(all(nullable_bool(proof[k]) for k in ['apiExact','hmacMatch','tokensDistinct']))
        C.require(type(proof['db']) is dict and set(proof['db'])==set(DB_FLAGS) and all(nullable_bool(v) for v in proof['db'].values()))
        C.require(type(proof['tokens']) is dict and set(proof['tokens'])=={'anon','serviceRole'})
        for t in proof['tokens'].values():
            C.require(type(t) is dict and set(t)==TOKEN_KEYS and (t['partsCount'] is None or type(t['partsCount']) is int and 0<=t['partsCount']<=64))
            C.require(isinstance(t['alg'],str) and t['alg'] in ALG and isinstance(t['signature'],str) and t['signature'] in SIGNATURE and nullable_bool(t['roleMatch']) and nullable_bool(t['ownedKidMatch']))
        return json.loads(json.dumps(proof))
    except Exception:return None


READBACK_FIELDS={'containers':{'count','roles','loopback','backendGroup'},'authJwks':{'count','freshKey','privateAbsent'},'database':{'counts'}}
EXPECTED_BASELINE={'migrations':123,'publicTables':71,'publicWithoutRls':0,
                   'auth':0,'profiles':0,'classrooms':0,'xp':0,'wallet':0,'mediaRuns':0,'mediaAssets':0,
                   'questions':259,'publishedQuestions':258,'reviewCards':9,'hints':17,'blooks':20,'quizTemplates':26}
BASELINE_KEYS=set(EXPECTED_BASELINE)

def empty_readback():
    return {'status':None,**{k:{'state':'NOT_REACHED',**dict.fromkeys(fields)} for k,fields in READBACK_FIELDS.items()}}


def safe_readback(value):
    try:
        C.require(type(value) is dict and set(value)=={'status',*READBACK_FIELDS})
        C.require(value['status'] is None or safe_status(value['status']) is not None)
        for name,fields in READBACK_FIELDS.items():
            row=value[name];C.require(type(row) is dict and set(row)=={'state',*fields} and isinstance(row['state'],str) and row['state'] in {'NOT_REACHED','PASS','FAIL','UNKNOWN'})
            if row['state']=='NOT_REACHED':C.require(all(row[k] is None for k in fields))
            if row['state']=='PASS':
                C.require(all(row[k] is not None for k in fields))
                if name in {'containers','authJwks'}:C.require(row['count']==(8 if name=='containers' else 1) and all(row[k] is True for k in fields if k!='count'))
                if name=='database':C.require(type(row['counts']) is dict and set(row['counts'])==BASELINE_KEYS and all(type(row['counts'][k]) is int and row['counts'][k]==n for k,n in EXPECTED_BASELINE.items()))
            for key in fields:
                v=row[key]
                if key=='count':C.require(v is None or type(v) is int and 0<=v<=10000)
                elif key=='counts':C.require(v is None or type(v) is dict and set(v)==BASELINE_KEYS and all(n is None or type(n) is int and 0<=n<=2**53 for n in v.values()))
                else:C.require(nullable_bool(v))
        return json.loads(json.dumps(value))
    except Exception:return None


def readback_summary(runtime):
    value=empty_readback()
    for name in value:
        path=Path(runtime)/('bootstrap-'+('status' if name=='status' else name)+'-proof.json')
        if path.exists():
            try:value[name]=C.decode(C.read_file(path,private=True))
            except Exception:
                if name!='status':value[name]={'state':'UNKNOWN',**dict.fromkeys(READBACK_FIELDS[name])}
    return safe_readback(value)


def record(runtime,name,value):
    C.write_once(Path(runtime)/('bootstrap-'+name+'-proof.json'),value)
