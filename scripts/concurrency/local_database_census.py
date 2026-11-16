"""Validate complete census metadata; normalize only table-record array order."""
import hashlib
import json
import re

NAME = re.compile(r'[A-Za-z_][A-Za-z0-9_]{0,62}\Z')
HASH = re.compile(r'[a-f0-9]{64}\Z')


class CensusInvalid(ValueError):
    def __init__(self):
        super().__init__('SNAPSHOT_CENSUS_INVALID')


def require(value):
    if not value:
        raise CensusInvalid()


def exact(value, keys):
    require(type(value) is dict and set(value) == set(keys))


def metadata(value):
    require(type(value['count']) is int and value['count'] >= 0)
    require(type(value['sha256']) is str and HASH.fullmatch(value['sha256']))
    return {'count': value['count'], 'sha256': value['sha256']}


def canonicalize(value, databases):
    require(type(databases) is list and 1 <= len(databases) <= 2 and
            all(type(name) is str for name in databases))
    require(databases == sorted(set(databases)) and 'postgres' in databases and
            set(databases) <= {'postgres', '_supabase'})
    exact(value, ['clusterRoles', *databases])
    exact(value['clusterRoles'], ['count', 'sha256'])
    result = {'clusterRoles': metadata(value['clusterRoles'])}
    for database in databases:
        rows = value[database]
        require(type(rows) is list and len(rows) <= 256)
        seen, copied = set(), []
        for row in rows:
            exact(row, ['schema', 'table', 'count', 'sha256'])
            require(all(type(row[key]) is str and NAME.fullmatch(row[key])
                        for key in ['schema', 'table']))
            identity = (row['schema'], row['table'])
            require(identity not in seen)
            seen.add(identity)
            copied.append({'schema': row['schema'], 'table': row['table'], **metadata(row)})
        result[database] = sorted(copied, key=lambda row: (row['schema'], row['table']))
    return result


def digest(value):
    raw = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()
    return hashlib.sha256(raw).hexdigest()


def compare(before, after, databases):
    """Return bounded private diagnostics; invalid input never contributes names/values."""
    invalid = {'schemaVersion': 1, 'classification': 'INVALID', 'equal': False,
               'orderSha256': None, 'canonicalSha256': None, 'counts': None, 'changes': []}
    try:
        left, right = canonicalize(before, databases), canonicalize(after, databases)
    except CensusInvalid:
        return invalid
    changes = []
    counts = {'databases': len(databases), 'tablesBefore': 0, 'tablesAfter': 0,
              'added': 0, 'removed': 0, 'countChanged': 0, 'digestChanged': 0,
              'rolesChanged': int(left['clusterRoles'] != right['clusterRoles'])}
    for database in databases:
        old = {(row['schema'], row['table']): row for row in left[database]}
        new = {(row['schema'], row['table']): row for row in right[database]}
        counts['tablesBefore'] += len(old)
        counts['tablesAfter'] += len(new)
        for identity in sorted(old.keys() | new.keys()):
            previous, current = old.get(identity), new.get(identity)
            kinds = []
            if previous is None:
                kinds.append('ADDED'); counts['added'] += 1
            elif current is None:
                kinds.append('REMOVED'); counts['removed'] += 1
            else:
                for field, kind, counter in [('count', 'COUNT_CHANGED', 'countChanged'),
                                             ('sha256', 'DIGEST_CHANGED', 'digestChanged')]:
                    if previous[field] != current[field]:
                        kinds.append(kind); counts[counter] += 1
            if kinds:
                changes.append({'database': database, 'schema': identity[0], 'table': identity[1],
                                'kinds': kinds, 'before': previous, 'after': current})
    equal = left == right
    return {'schemaVersion': 1, 'classification': ('IDENTICAL' if before == after else 'ORDER_ONLY')
            if equal else 'DATA_CHANGED', 'equal': equal,
            'orderSha256': {'before': digest(before), 'after': digest(after)},
            'canonicalSha256': {'before': digest(left), 'after': digest(right)},
            'counts': counts, 'changes': changes}
