"""Capture one externally approved Local dataset; never attest retention."""
import argparse
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import tarfile
import time
import local_snapshot_contracts as C
from local_snapshot_native import NativeIO
import local_edge_shutdown as E
import local_rest_shutdown as R


def mounts(row):
    return sorted([{'type':v['Type'],'name':v.get('Name') if v['Type']=='volume' else None,
        'source':v['Source'],'destination':v['Destination'],'readWrite':v['RW'],
        'driver':v.get('Driver') if v['Type']=='volume' else None} for v in row['Mounts']],key=lambda m:m['destination'])


def admit_observation(value, plan, runtime):
    C.require(value['boot']==plan['preview']['hostBootIdSha256'],'SNAPSHOT_BOOT_CHANGED')
    rows=value['containers']
    C.require(len(rows)==8 and set(value['allContainerIds'])=={r['id'] for r in plan['containers']})
    expected={r['id']:r for r in plan['containers']};seen=set();volumes={}
    for row in rows:
        C.require(row['Id'] in expected and row['Id'] not in seen,'SNAPSHOT_CONTAINER_CHANGED')
        approved=expected[row['Id']]
        C.require(row['Name']==approved['name'] and row['Image']==approved['imageId'] and row['State']['Running'] is True and
                  row['Config']['Labels']['com.supabase.cli.project']==C.PROJECT and
                  mounts(row)==sorted(approved['mounts'],key=lambda m:m['destination']),'SNAPSHOT_CONTAINER_CHANGED')
        C.require(row['Config'].get('StopSignal','SIGTERM') in {'','SIGTERM','SIGINT','SIGQUIT'})
        for mount in approved['mounts']:
            source=Path(mount['source'])
            if mount['type']=='bind':
                C.require(source==runtime or runtime in source.parents,'SNAPSHOT_BIND_OUTSIDE_RUNTIME')
            else:
                C.require(str(source)==value['dockerRoot']+'/volumes/'+mount['name']+'/_data','SNAPSHOT_VOLUME_SCOPE_INVALID')
                if mount['name'] in volumes:C.require(volumes[mount['name']]==mount)
                volumes[mount['name']]=mount
        seen.add(row['Id'])
    actual={row['Name']:row for row in value['volumes']}
    C.require(len(actual)==len(value['volumes']) and set(actual)==set(volumes),'SNAPSHOT_VOLUME_SCOPE_INVALID')
    for name,mount in volumes.items():
        row=actual[name]
        C.require(row['Driver']=='local' and row['Mountpoint']==mount['source'] and not row.get('Options'),
                  'SNAPSHOT_VOLUME_SCOPE_INVALID')
    C.require(any(m['destination']=='/var/lib/postgresql/data' for r in plan['containers'] if r['role']=='db' for m in r['mounts']) and
              any(m['destination']=='/mnt' for r in plan['containers'] if r['role']=='storage' for m in r['mounts']))
    return volumes


def stopped(rows, originals, edge_proofs=None, rest_scope=None):
    C.require(len(rows)==len(originals) and {r['Id'] for r in rows}=={r['Id'] for r in originals},'SNAPSHOT_STOP_UNKNOWN')
    initial={r['Id']:r for r in originals}
    signals={'SIGTERM':15,'SIGINT':2,'SIGQUIT':3}
    for row in rows:
        before=initial[row['Id']];state=row['State']
        C.require(row['Name']==before['Name'] and row['Image']==before['Image'] and mounts(row)==mounts(before))
        normal=signals[before['Config'].get('StopSignal') or 'SIGTERM']
        codes={0} if before['Name'].startswith('/supabase_db_') else {0,128+normal}
        evidence=(edge_proofs or {}).get(row['Id'])
        if evidence and before['Name']==E.NAME and before['Image']==E.IMAGE:
            if state.get('Dead')is False and E.eligible15(evidence['receipt'],evidence['bindings'],evidence['diagnostic']):codes.add(15)
        if state['ExitCode']==255 and evidence and rest_scope and before['Name']==R.NAME and before['Image']==R.IMAGE:
            try:valid=R.eligible255(evidence.get('restReceipt'),R.bindings(*rest_scope),before,row)
            except (ValueError,KeyError,TypeError):valid=False
            if valid:codes.add(255)
        C.require(state['Running'] is False and state['Pid']==0 and state['OOMKilled'] is False and
                  state['ExitCode'] in codes and not state.get('Error') and not state.get('Restarting'), 'SNAPSHOT_STOP_UNKNOWN')


def mailbox(io, directory):
    def census():
        rows=[];start=0;summary=None
        for _ in range(401):
            io.check();value=C.decode(io.get('/api/v1/messages?start='+str(start)+'&limit=50'))
            C.exact(value,['total','unread','count','messages_count','messages_unread','start','tags','messages'])
            C.require(C.integer(value['total']) and value['total']<=C.MAX_FILES and value['start']==start and
                      type(value['messages'])is list and value['count']==len(value['messages']) and
                      value['messages_count']==value['total'] and value['messages_unread']==value['unread'])
            current={k:value[k] for k in ['total','unread','tags']}
            C.require(summary is None or summary==current,'SNAPSHOT_MAIL_CENSUS_CHANGED');summary=current
            for row in value['messages']:
                C.require(type(row)is dict and isinstance(row.get('ID'),str) and row['ID']!='latest' and re.fullmatch('[A-Za-z0-9_-]{1,80}',row['ID']) and
                          C.integer(row.get('Size'),1) and row['Size']<=50*1024**2 and type(row.get('Read'))is bool and
                          type(row.get('Tags'))is list and isinstance(row.get('Created'),str))
                rows.append(row)
            start+=len(value['messages'])
            C.require(start<=value['total'] and len({r['ID'] for r in rows})==len(rows),'SNAPSHOT_MAIL_CENSUS_CHANGED')
            if start==value['total']:return {'summary':summary,'messages':sorted(rows,key=lambda r:r['ID'])}
            C.require(bool(value['messages']),'SNAPSHOT_MAIL_PAGE_MISSING')
        raise C.SnapshotError('SNAPSHOT_MAIL_PAGE_LIMIT')
    before=census()
    for row in before['messages']:
        body=io.get('/api/v1/message/'+row['ID']+'/raw')
        C.require(len(body)==row['Size'],'SNAPSHOT_MAIL_SIZE_INVALID')
        C.write_once(directory/(row['ID']+'.eml'),body)
    C.require(census()==before,'SNAPSHOT_MAIL_CENSUS_CHANGED')
    C.write_once(directory/'census.json',before)
    return len(before['messages'])


def validate_archive(target):
    with tarfile.open(target,mode='r:') as archive:
        total=count=0
        for item in archive:
            name=item.name.removeprefix('./')
            C.require(not name.startswith('/') and '..' not in Path(name).parts and
                      (item.isfile() or item.isdir()) and not item.issym() and not item.islnk(),'SNAPSHOT_ARCHIVE_INVALID')
            total+=item.size;count+=1
            C.require(total<=C.LIMIT and count<=C.MAX_FILES,'SNAPSHOT_SIZE_LIMIT')


def runtime_fingerprints(records):
    return sorted(records,key=lambda r:r['path'])


def shutdown_census(io, plan, output):
    records=[]
    try:
        for row in plan['containers']:
            io.check()
            try:value=io.stop_diagnostics(row) if hasattr(io,'stop_diagnostics') else 'UNKNOWN'
            except Exception:value='UNKNOWN'
            records.append({'role':row['role'],'containerIdSha256':C.digest(row['id'].encode()),'observation':value})
    finally:
        try:C.write_once(output/'shutdown-before-census.json',{'complete':len(records)==8,'records':records})
        except Exception:io.shutdown_diagnostics='UNKNOWN'


def stop_one(io, row, output, sequence, approved):
    C.require(row in approved and type(sequence)is int and 0<=sequence<8,'SNAPSHOT_CONTAINER_CHANGED')
    io.check()
    prefix=output/('shutdown-'+str(sequence))
    def persist(suffix,value):
        try:C.write_once(Path(str(prefix)+'-'+suffix+'.json'),value)
        except Exception:io.shutdown_diagnostics='UNKNOWN'
    def observation():
        try:
            io.check()
            return io.stop_diagnostics(row) if hasattr(io,'stop_diagnostics') else 'UNKNOWN'
        except Exception:return 'UNKNOWN'
    started=time.monotonic()
    io.shutdown_diagnostics=getattr(io,'shutdown_diagnostics','RECORDED')
    persist('intent',{'sequence':sequence,'role':row['role'],'containerIdSha256':C.digest(row['id'].encode()),
        'operation':'DOCKER_STOP','signalMode':'DOCKER_CONFIGURED_STOP_SIGNAL','dockerTimeout':'-1',
        'requestedSeconds':90,'startedMonotonic':started})
    before=observation();persist('before',before)
    io.last_stop_command=None
    outcome='FAILED'
    try:
        io.stop(row);outcome='RETURNED_SUCCESS'
    finally:
        command=getattr(io,'last_stop_command',None)
        after=observation()
        state=after.get('state') if isinstance(after,dict) else None
        stopped_state=not state['Running'] if isinstance(state,dict) and type(state.get('Running'))is bool else 'UNKNOWN'
        persist('result',{'sequence':sequence,'role':row['role'],'outcome':outcome,
            'elapsedSeconds':time.monotonic()-started,'command':command if isinstance(command,dict) else 'UNKNOWN',
            'containerStopped':stopped_state,'observation':after,
            'edgeReceipt':getattr(io,'edge_shutdown_receipt',None) if row['role']=='edge_runtime' else None,
            'serviceReceipt':getattr(io,'service_shutdown_receipts',{}).get(row['role']),
            'restReceipt':getattr(io,'rest_shutdown_receipt',None) if row['role']=='rest' else None})
    return {'receipt':getattr(io,'edge_shutdown_receipt',None),'bindings':getattr(io,'edge_bindings',None),'diagnostic':after,'restReceipt':getattr(io,'rest_shutdown_receipt',None) if row['role']=='rest' else None}


def snapshot(plan_path, approval, ports=None):
    io=ports or NativeIO();output=None;created=False;stage='admission'
    try:
        C.require(io.platform=='linux','SNAPSHOT_LINUX_REQUIRED')
        C.directory(Path(plan_path).parent)
        raw=C.read_file(Path(plan_path),1048576,private=True)
        plan=C.parse_plan(raw,approval)
        runtime=io.source.parent/'live-recovery-runtime/whole-site-261115'
        C.directory(runtime)
        output=runtime.parent/'snapshots'/plan['instanceNonce']
        C.require(not os.path.lexists(output),'SNAPSHOT_OUTPUT_EXISTS')
        io.frozen(plan)
        context,profile,installed=C.bindings(io.source,runtime,plan,io.environment)
        observed=io.observe(plan,context,profile)
        volume_map=admit_observation(observed,plan,runtime)
        stop_scope=(raw,approval,C.read_file(runtime/'execution-context.json',private=True))
        if hasattr(io,'bind_stop_policy'):io.bind_stop_policy(*stop_scope)
        parent=output.parent
        if not parent.exists():parent.mkdir(mode=0o700)
        C.directory(parent);output.mkdir(mode=0o700);created=True
        C.write_once(output/'snapshot-intent.json',{'planSha256':approval,'sourceRevision':plan['sourceRevision'],
            'executionAuthority':'NONE','retention':'UNVERIFIED'})
        if hasattr(io,'bind_stop_output'):io.bind_stop_output(output)
        stage='shutdown_census';shutdown_census(io,plan,output)
        stage='preview_stop';io.stop_preview(plan['preview'])
        stage='mailpit';mail=output/'mailpit';mail.mkdir(mode=0o700)
        messages=mailbox(io,mail)
        C.write_once(output/'container-inventory.json',observed)
        stage='non_db_stop'
        non_db=[r for r in plan['containers'] if r['role']!='db']
        edge_proofs={}
        for index,row in enumerate(non_db):
            proof=stop_one(io,row,output,index,plan['containers'])
            if row['role'] in {'edge_runtime','rest'}:edge_proofs[row['id']]=proof
        stopped(io.inspect(non_db),[r for r in observed['containers'] if r['Id'] in {v['id'] for v in non_db}],edge_proofs,stop_scope)
        stage='database';actual=io.database(plan)
        C.require(actual==plan['databases'],'SNAPSHOT_DATABASE_SET_CHANGED')
        before=io.census(actual);C.write_once(output/'database-census-before.json',before)
        database=output/'database';database.mkdir(mode=0o700)
        for name in actual:io.dump(name,database/(name+'.dump'))
        io.dump(None,database/'globals.sql')
        io.database_files(database)
        for name in ['postgresql.tar','postgresql-custom.tar']:validate_archive(database/name)
        C.require((database/'pgsodium_root.key').is_file() and 0<(database/'pgsodium_root.key').stat().st_size<=4096,'SNAPSHOT_VAULT_KEY_MISSING')
        C.require(all((database/(name+'.dump')).stat().st_size>0 for name in actual) and
                  (database/'globals.sql').stat().st_size>0,'SNAPSHOT_DUMP_MISSING')
        after=io.census(actual);C.require(before==after,'SNAPSHOT_DATABASE_CHANGED')
        C.write_once(output/'database-census-after.json',after)
        stage='database_stop';stop_one(io,next(r for r in plan['containers'] if r['role']=='db'),output,7,plan['containers'])
        closed=io.inspect(plan['containers']);stopped(closed,observed['containers'],edge_proofs,stop_scope)
        C.write_once(output/'stop-proof.json',{'containers':closed,'forcedTermination':False})
        stage='volumes';volumes=output/'volumes';volumes.mkdir(mode=0o700)
        for index,(name,mount) in enumerate(sorted(volume_map.items())):
            target=volumes/('v'+str(index)+'.tar')
            census=io.volume(mount,target);validate_archive(target)
            C.write_once(volumes/('v'+str(index)+'-census.json'),{'name':name,'source':mount['source'],'entries':census})
        stage='runtime';io.barrier(plan,context)
        copied=output/'runtime';copied.mkdir(mode=0o700)
        excluded={name:C.digest(body) for name,body in installed.items() if name.endswith(('.py','.mjs'))}
        records=C.copy_runtime(runtime,copied,excluded,io.check)
        C.require(runtime_fingerprints(C.runtime_census(runtime,excluded,io.check))==runtime_fingerprints(records),'SNAPSHOT_RUNTIME_CHANGED')
        io.frozen(plan);C.bindings(io.source,runtime,plan,io.environment);io.barrier(plan,context)
        stopped(io.inspect(plan['containers']),observed['containers'],edge_proofs,stop_scope)
        C.write_once(output/'runtime-census.json',records)
        stage='publication';files=C.inventory(output,io.check)
        manifest={'schemaVersion':1,'kind':'LOCAL_SNAPSHOT_INVENTORY','planSha256':approval,
            'sourceRevision':plan['sourceRevision'],'executionProfileSha256':plan['executionProfileSha256'],
            'jobIdentitySha256':plan['jobIdentitySha256'],'mailpitCaptureMode':'RFC822_AND_EXPOSED_METADATA',
            'messages':messages,'files':files,'executionAuthority':'NONE','retention':'UNVERIFIED'}
        manifest_sha=C.write_once(output/'snapshot-manifest.json',manifest)
        C.inventory(output,io.check)
        C.require(getattr(io,'closure','UNKNOWN')=='VERIFIED','SNAPSHOT_SUBPROCESS_CLOSURE_UNKNOWN')
        io.check()
        return {'result':'LOCAL_SNAPSHOT_CREATED','executionAuthority':'NONE','retention':'UNVERIFIED',
            'snapshotDirectory':str(output),'snapshotManifestSha256':manifest_sha,
            'files':len(files),'plaintextBytes':sum(r['bytes'] for r in files)}
    except Exception as error:
        result={'result':'FAILED','code':str(error) if isinstance(error,C.SnapshotError) else 'SNAPSHOT_OPERATION_FAILED',
            'stage':stage,'executionAuthority':'NONE','retention':'UNVERIFIED',
            'snapshotDirectory':str(output) if created and output.is_dir() else None,
            'subprocessClosure':getattr(io,'closure','UNKNOWN'),'shutdownDiagnostics':getattr(io,'shutdown_diagnostics','NOT_REACHED')}
        if result['snapshotDirectory']:
            try:C.write_once(output/'failure-container-inventory.json',io.inspect(plan['containers']))
            except Exception:result['containerReadback']='UNKNOWN'
            try:C.write_once(output/'snapshot-failed.json',result)
            except Exception:result['failurePublication']='UNKNOWN'
        return result


class SafeParser(argparse.ArgumentParser):
    def error(self,_message):raise C.SnapshotError('SNAPSHOT_ARGUMENTS_INVALID')


def main(args=None):
    handlers={};native=None
    try:
        parser=SafeParser(add_help=False);parser.add_argument('--plan',required=True);parser.add_argument('--approve',required=True)
        values=parser.parse_args(args);native=NativeIO()
        def interrupted(_number,_frame):native.cancelled=True
        for number in [signal.SIGINT,signal.SIGTERM]:
            handlers[number]=signal.signal(number,interrupted)
        result=snapshot(values.plan,values.approve,native)
    except Exception:result={'result':'FAILED','code':'SNAPSHOT_ARGUMENTS_INVALID','executionAuthority':'NONE','retention':'UNVERIFIED'}
    finally:
        for number,handler in handlers.items():signal.signal(number,handler)
    print(json.dumps(result));return 0 if result['result']=='LOCAL_SNAPSHOT_CREATED' else 1


if __name__=='__main__':sys.exit(main())
