"""Root-owned Linux proc parsers. No credentials, cmdline or environ reads."""
import hashlib
import json
import math
import re

def _fail():
    raise ValueError("LINUX_PROC_INVALID")

def _integer(value, maximum=2**63-1):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{1,20}", value): _fail()
    parsed=int(value)
    if parsed > maximum: _fail()
    return parsed

def _kilobytes(text, names):
    result={}
    for line in text.splitlines():
        key=line.split(":",1)[0]
        if key not in names: continue
        match=re.fullmatch(r"([A-Za-z_]+):[ \t]+([0-9]+)[ \t]+kB", line)
        if not match or key in result: _fail()
        result[key]=_integer(match[2])*1024
    if result.keys() != set(names): _fail()
    return result

def parse_meminfo(text):
    row=_kilobytes(text, ("MemTotal","MemAvailable","SwapTotal","SwapFree"))
    if row["MemTotal"] <= 0 or row["MemAvailable"] > row["MemTotal"] or row["SwapFree"] > row["SwapTotal"]: _fail()
    return {"totalBytes":row["MemTotal"],"availableBytes":row["MemAvailable"],"swapTotalBytes":row["SwapTotal"],"swapFreeBytes":row["SwapFree"]}

def parse_stat(text):
    match=re.fullmatch(r"([0-9]+) \(.*\) ([RSDZTtXxKWPI]) (.*)", text.strip())
    if not match: _fail()
    pid=_integer(match[1],2**31-1)
    if pid == 0: _fail()
    fields=match[3].split()
    if len(fields)<19: _fail()
    # fields[0] is /proc stat field 4; stat field 22 is index 18.
    return {"pid":pid,"ppid":_integer(fields[0],2**31-1),"state":match[2],"userTicks":_integer(fields[10]),"systemTicks":_integer(fields[11]),"startTicks":str(_integer(fields[18]))}

def parse_psi(text):
    result={}
    for line in text.splitlines():
        fields=line.split()
        if not fields or fields[0] not in ("some","full") or fields[0] in result: _fail()
        values={}
        for item in fields[1:]:
            parts=item.split("=")
            if len(parts)!=2 or parts[0] in values: _fail()
            values[parts[0]]=parts[1]
        if values.keys()!={"avg10","avg60","avg300","total"}: _fail()
        row={}
        for key in ("avg10","avg60","avg300"):
            if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?",values[key]): _fail()
            value=float(values[key])
            if not math.isfinite(value) or value<0 or value>100: _fail()
            row[key]=value
        row["totalUs"]=_integer(values["total"])
        result[fields[0]]=row
    if result.keys()!={"some","full"}: _fail()
    return result

def parse_smaps_rollup(text):
    row=_kilobytes(text,("Rss","Pss"))
    if row["Pss"] > row["Rss"]: _fail()
    return {"rssBytes":row["Rss"],"pssBytes":row["Pss"]}

def process_identity(boot_sha256, pid, start_ticks, uid):
    if not isinstance(boot_sha256,str) or not re.fullmatch(r"[a-f0-9]{64}",boot_sha256): _fail()
    if type(pid) is not int or pid<=0 or pid>2**31-1 or type(uid) is not int or uid<0 or uid>2**32-1: _fail()
    start=str(_integer(start_ticks))
    payload=json.dumps([boot_sha256,pid,start,uid],separators=(",",":"))
    return hashlib.sha256(payload.encode()).hexdigest()
