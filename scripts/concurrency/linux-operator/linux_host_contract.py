"""Closed host targets and GitHub provenance; no IO and no authority factory."""
FREE = 'LINUX_FREE_4CPU_16G_V1'
VM = 'LINUX_VM_16CPU_32G_V1'
REPOSITORY = 'peiyi-liu/colorplay_v1'
GIB = 1024**3
_TARGETS = {
    FREE: (4, 16, 14, 'codex/local-capacity-linux-20261116', 'local-capacity-linux.yml', 'LOCAL_LINUX_FREE_BOOTSTRAP_ONCE', 240),
    VM: (16, 32, 28, 'codex/local-capacity-vm-20261118', 'local-capacity-vm.yml', 'LOCAL_LINUX_VM_BOOTSTRAP_ONCE', 75),
}


def need(ok):
    if not ok:
        raise ValueError('HOST_CONTRACT_INVALID')


def target(kind):
    need(type(kind) is str and kind in _TARGETS)
    cpu, nominal, minimum, branch, workflow, confirmation, admission = _TARGETS[kind]
    return {'kind': kind, 'cpu': cpu, 'nominal': nominal * GIB, 'minimum': minimum * GIB,
            'ref': 'refs/heads/' + branch,
            'workflowRef': REPOSITORY + '/.github/workflows/' + workflow + '@refs/heads/' + branch,
            'eventName': 'push', 'confirmation': confirmation, 'admissionMinutes': admission}


def provenance(kind):
    value = target(kind)
    return {key: value[key] for key in ('ref', 'workflowRef', 'eventName')}


def environment_target(environment):
    ref = environment.get('GITHUB_REF')
    kind = VM if ref == target(VM)['ref'] else FREE
    expected = provenance(kind)
    for field, key in [('ref', 'GITHUB_REF'), ('workflowRef', 'GITHUB_WORKFLOW_REF'), ('eventName', 'GITHUB_EVENT_NAME')]:
        if kind == VM or key in environment:
            need(environment.get(key) == expected[field])
    return target(kind)


def request_target(request, environment=None):
    kind = next((key for key in _TARGETS if request.get('confirmation') == target(key)['confirmation']), None)
    value = target(kind)
    if kind == VM:
        need(request.get('provenance') == provenance(VM))
    else:
        need('provenance' not in request)
    if environment is not None:
        need(environment_target(environment)['kind'] == kind)
    return value


def kind_for_cpu(cpu):
    need(type(cpu) is int and cpu in (4, 16))
    return FREE if cpu == 4 else VM


def hardware_matches(kind, logical, affinity, memory):
    value = target(kind)
    return (type(logical) is int and logical == value['cpu'] and
            type(affinity) is list and len(affinity) == value['cpu'] and
            all(type(cpu) is int and cpu >= 0 for cpu in affinity) and
            len(set(affinity)) == value['cpu'] and type(memory) is int and
            value['minimum'] <= memory <= value['nominal'])


def profile_kind(host):
    kind = kind_for_cpu(host.get('logicalCpu'))
    value = target(kind)
    need(host.get('nominalMemoryBytes') == value['nominal'] and
         hardware_matches(kind, host['logicalCpu'], host.get('affinityCpus'), host.get('memTotalBytes')))
    quota, period = host.get('cpuQuotaUs'), host.get('cpuPeriodUs')
    need((quota is None and period is None) or
         (type(quota) is int and type(period) is int and period > 0 and quota == value['cpu'] * period))
    need(host.get('dedicatedGenerator') is False)
    return kind
