"""Pure fixed PostgREST vendor-interruption evidence; no I/O or signal authority."""
import datetime
import hashlib
import json
import math
import re

IMAGE='sha256:de2f4d042d5efb5d1362d98c11e5e0773bedc1376bafcdb4ec863fc18d25f52d'
TAG='public.ecr.aws/supabase/postgrest:v14.14'
NAME='/supabase_rest_cp-whole-site-261115'
MONTHS=dict(zip(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],range(1,13)))
LINE=re.compile(rb'([0-9]{2})/([A-Z][a-z]{2})/([0-9]{4}):([0-9]{2}):([0-9]{2}):([0-9]{2}) ([+-])([0-9]{2})([0-9]{2}): Received termination unix signal (SIGTERM|SIGINT)')


def require(ok):
    if not ok:raise ValueError('REST_INTERRUPTION_UNVERIFIED')


def sha(raw):return hashlib.sha256(raw).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':')).encode()
def receipt_bytes(value):return (json.dumps(value,sort_keys=True)+'\n').encode()


def unique(pairs):
    value={}
    for key,item in pairs:require(key not in value);value[key]=item
    return value


def hexadecimal(value,length=64):return type(value)is str and re.fullmatch('[a-f0-9]{'+str(length)+'}',value)is not None

def bindings(plan_raw,approved,context_raw):
    require(type(plan_raw)is bytes and type(context_raw)is bytes and len(plan_raw)<=1048576 and len(context_raw)<=262144 and sha(plan_raw)==approved)
    plan=json.loads(plan_raw,object_pairs_hook=unique);ctx=json.loads(context_raw,object_pairs_hook=unique)
    require(type(plan['schemaVersion'])is int and plan['schemaVersion']==1 and type(ctx['schemaVersion'])is int and ctx['schemaVersion']==1 and plan['confirmation']=='LOCAL_LINUX_SNAPSHOT_ONCE')
    require(plan['projectId']==ctx['projectId']=='cp-whole-site-261115' and plan['sourceRevision']==ctx['sourceRevision'] and hexadecimal(plan['sourceRevision'],40))
    require(plan['executionContextSha256']==sha(context_raw) and hexadecimal(plan['executionProfileSha256']))
    require(plan['instanceNonce']==ctx['instanceNonce'] and hexadecimal(plan['instanceNonce'],32))
    job=ctx['job'];require(set(job)=={'repository','runId','runAttempt','jobName'})
    require(job['repository']=='peiyi-liu/colorplay_v1' and type(job['runId'])is str and re.fullmatch('[0-9]{1,20}',job['runId']) and type(job['runAttempt'])is int and job['runAttempt']==1 and job['jobName']=='capacity-linux')
    require(sha(canonical(job))==plan['jobIdentitySha256'])
    roles={'db','auth','rest','realtime','storage','edge_runtime','kong','inbucket'}
    require(len(plan['containers'])==len(ctx['containers'])==8 and {r['role'] for r in ctx['containers']}==roles)
    require(sorted([{k:r[k] for k in ['role','id','name','imageId']} for r in plan['containers']],key=lambda r:r['role'])==sorted(ctx['containers'],key=lambda r:r['role']))
    require(len({r['id'] for r in ctx['containers']})==8 and all(hexadecimal(r['id']) for r in ctx['containers']))
    row=next(r for r in ctx['containers'] if r['role']=='rest');require(row['name']==NAME and row['imageId']==IMAGE)
    boot=plan['preview']['hostBootIdSha256'];require(hexadecimal(boot))
    return {'sourceRevision':plan['sourceRevision'],'approvedPlanSha256':approved,'contextSha256':sha(context_raw),
            'executionProfileSha256':plan['executionProfileSha256'],'jobSha256':plan['jobIdentitySha256'],
            'instanceNonce':plan['instanceNonce'],'bootSha256':boot,'restIdSha256':sha(row['id'].encode()),'imageId':IMAGE,'imageTag':TAG}


def valid_bindings(value):
    keys={'sourceRevision','approvedPlanSha256','contextSha256','executionProfileSha256','jobSha256','instanceNonce','bootSha256','restIdSha256','imageId','imageTag'}
    return type(value)is dict and set(value)==keys and value['imageId']==IMAGE and value['imageTag']==TAG and all(hexadecimal(value[k],40 if k=='sourceRevision' else 32 if k=='instanceNonce' else 64) for k in keys-{'imageId','imageTag'})


def normalize(item,expected,before):
    require(type(item)is dict and hexadecimal(item['Id']) and sha(item['Id'].encode())==expected['restIdSha256'] and item['Name']==NAME and item['Image']==IMAGE)
    config=item['Config'];host=item['HostConfig'];state=item['State'];policy=host['RestartPolicy']
    require(config['Image']==TAG and config['Cmd']==['/bin/postgrest'] and 'Entrypoint' in config and config['Entrypoint']is None)
    signal=config.get('StopSignal');require(signal is None or signal in ('','SIGTERM'))
    require(all(type(state[k])is bool for k in ['Running','Paused','Restarting','Dead','OOMKilled']) and all(state[k]is False for k in ['Paused','Restarting','Dead','OOMKilled']) and type(state['Error'])is str and not state['Error'])
    require(state['Running']is before and type(state['Pid'])is int and (state['Pid']>1 if before else state['Pid']==0))
    require(type(state['ExitCode'])is int and type(item['RestartCount'])is int and item['RestartCount']>=0)
    require(policy['Name']=='unless-stopped' and type(policy['MaximumRetryCount'])is int and policy['MaximumRetryCount']==0 and host['AutoRemove']is False)
    init='ABSENT' if 'Init' not in host else 'NULL' if host['Init']is None else 'FALSE' if host['Init']is False else 'UNKNOWN';require(init!='UNKNOWN')
    config_hash=sha(canonical([config['Image'],config['Cmd'],config['Entrypoint'],'StopSignal' in config,signal,init]))
    return {'identitySha256':sha(canonical([item['Id'],item['Name'],item['Image'],config_hash])),
            'configSha256':config_hash,'initPidSha256':sha(str(state['Pid']).encode()),'phase':'RUNNING' if before else 'STOPPED',
            'exitCode':state['ExitCode'],'restartCount':item['RestartCount'],'restartPolicy':policy['Name'],'retry':0}


def single_process(raw,pid):
    require(type(raw)is bytes and len(raw)<=16384 and type(pid)is int and 1<pid<=2**31-1)
    text=raw.decode('ascii');require(all(32<=ord(c)<=126 or c in '\n\t' for c in text))
    lines=text.splitlines();require(len(lines)==2 and lines[0].split()==['PID','PPID','COMMAND'])
    row=lines[1].split();require(len(row)==3 and row[0]==str(pid) and re.fullmatch('0|[1-9][0-9]{0,9}',row[1]) and int(row[1])<=2**31-1 and row[2]=='postgrest')
    return {'kind':'SINGLE_POSTGREST_PID1','processes':1,'initPidSha256':sha(str(pid).encode())}


def signal_line(raw):
    match=LINE.fullmatch(raw)
    if match is None:return None
    try:
        day,month,year,hour,minute,second,sign,zone_hour,zone_minute,signal=match.groups()
        datetime.date(int(year),MONTHS[month.decode()],int(day));datetime.time(int(hour),int(minute),int(second))
        require(int(zone_hour)<24 and int(zone_minute)<60)
        return signal.decode()
    except (ValueError,KeyError):return None


def log_transition(before,after):
    value={'result':'UNKNOWN','reason':'LOG_UNAVAILABLE','beforeBytes':None,'afterBytes':None,'beforeSha256':None,'afterSha256':None,
           'beforeRows':None,'afterRows':None,'beforeTermCount':None,'newRows':None,'newTermCount':None}
    try:
        for label,raw in [('before',before),('after',after)]:
            value['reason']='LOG_UNAVAILABLE' if raw is None else 'LOG_SHAPE_INVALID'
            require(type(raw)is bytes and len(raw)<=65536 and b'\r' not in raw and b'\0' not in raw and (not raw or raw.endswith(b'\n')))
            raw.decode('utf-8');lines=raw.splitlines();require(len(lines)<80)
            value[label+'Bytes']=len(raw);value[label+'Sha256']=sha(raw);value[label+'Rows']=len(lines)
        value['reason']='LOG_PREFIX_CHANGED';require(after.startswith(before))
        value['beforeTermCount']=sum(signal_line(line)=='SIGTERM' for line in before.splitlines())
        value['reason']='TERM_ALREADY_PRESENT';require(value['beforeTermCount']==0 and not any(signal_line(line) for line in before.splitlines()))
        suffix=after[len(before):].splitlines();value['newRows']=len(suffix)
        value['newTermCount']=sum(signal_line(line)=='SIGTERM' for line in suffix)
        value['reason']='SUFFIX_NOT_SINGLE_TERM';require(len(suffix)==1 and signal_line(suffix[0])=='SIGTERM')
        value.update(result='VERIFIED',reason='SINGLE_NEW_TERM')
    except (ValueError,UnicodeError,TypeError):pass
    return value


def command(value):
    require(type(value)is dict and value['clientClosed']is True and value['exitCode']==0 and type(value['exitCode'])is int and value['subprocessClosure']=='VERIFIED')
    result={key:value[key] for key in ['requestedSeconds','effectiveSeconds','elapsedSeconds']}
    require(all(type(v)in (int,float) and math.isfinite(v) for v in result.values()))
    require(0<result['effectiveSeconds']<=result['requestedSeconds']<=90 and 0<=result['elapsedSeconds']<=result['effectiveSeconds']+3)
    return {'operation':'ONE_DOCKER_STOP_CONFIGURED_TERM','clientClosed':True,'exitCode':0,'subprocessClosure':'VERIFIED',**result}


def observation(expected,before,after,topology,before_log,after_log,stop,elapsed):
    require(valid_bindings(expected))
    normalized_before=normalize(before,expected,True)
    require(type(topology)is dict and canonical(topology)==canonical({'kind':'SINGLE_POSTGREST_PID1','processes':1,'initPidSha256':normalized_before['initPidSha256']}))
    require(type(elapsed)in (int,float) and math.isfinite(elapsed) and 0<=elapsed<=90)
    return {'schemaVersion':1,'kind':'POSTGREST_VENDOR_INTERRUPTION','bindings':expected,
            'before':normalized_before,'after':normalize(after,expected,False),'topology':topology,
            'logs':log_transition(before_log,after_log),'command':command(stop),'elapsedSeconds':elapsed,
            'executionAuthority':'NONE','retention':'UNVERIFIED'}


def eligible255(evidence,expected,before,after):
    try:
        require(valid_bindings(expected))
        require(type(evidence)is dict and set(evidence)=={'status','receiptSha256','observation','completionElapsedSeconds'} and evidence['status']=='VERIFIED')
        value=evidence['observation'];require(type(value)is dict and set(value)=={'schemaVersion','kind','bindings','before','after','topology','logs','command','elapsedSeconds','executionAuthority','retention'})
        require(type(value['schemaVersion'])is int and value['schemaVersion']==1 and value['kind']=='POSTGREST_VENDOR_INTERRUPTION' and value['executionAuthority']=='NONE' and value['retention']=='UNVERIFIED')
        require(value['bindings']==expected and evidence['receiptSha256']==sha(receipt_bytes(value)))
        b=normalize(before,expected,True);a=normalize(after,expected,False)
        require(canonical(value['before'])==canonical(b) and canonical(value['after'])==canonical(a) and a['exitCode']==255)
        require(all(a[k]==b[k] for k in ['identitySha256','configSha256','restartCount','restartPolicy','retry']))
        require(canonical(value['topology'])==canonical({'kind':'SINGLE_POSTGREST_PID1','processes':1,'initPidSha256':b['initPidSha256']}))
        log=value['logs'];keys={'result','reason','beforeBytes','afterBytes','beforeSha256','afterSha256','beforeRows','afterRows','beforeTermCount','newRows','newTermCount'}
        require(type(log)is dict and set(log)==keys and log['result']=='VERIFIED' and log['reason']=='SINGLE_NEW_TERM')
        require(all(type(log[k])is int for k in ['beforeBytes','afterBytes','beforeRows','afterRows','beforeTermCount','newRows','newTermCount']))
        require(0<=log['beforeBytes']<log['afterBytes']<=65536 and 0<=log['beforeRows']<log['afterRows']<80 and log['afterRows']==log['beforeRows']+1 and log['afterBytes']-log['beforeBytes']==69 and log['beforeTermCount']==0 and log['newRows']==log['newTermCount']==1)
        require(hexadecimal(log['beforeSha256']) and hexadecimal(log['afterSha256']) and log['beforeSha256']!=log['afterSha256'])
        require(type(value['command'])is dict and set(value['command'])=={'operation','clientClosed','exitCode','subprocessClosure','requestedSeconds','effectiveSeconds','elapsedSeconds'} and command(value['command'])==value['command'])
        require(type(value['elapsedSeconds'])in (int,float) and math.isfinite(value['elapsedSeconds']) and 0<=value['elapsedSeconds']<=90 and value['command']['elapsedSeconds']<=value['elapsedSeconds'])
        require(type(evidence['completionElapsedSeconds'])in (int,float) and math.isfinite(evidence['completionElapsedSeconds']) and value['elapsedSeconds']<=evidence['completionElapsedSeconds']<=90)
        return True
    except (ValueError,KeyError,TypeError,StopIteration,OverflowError):return False
