#!/usr/bin/env node
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

function fail(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}

const mode = process.argv[2];
const projectRef = process.env.STAGING_PROJECT_REF;
const expectedRef = process.env.STAGING_EXPECTED_PROJECT_REF;
const serviceRoleKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const url = process.env.STAGING_SUPABASE_URL;

if (
  !['auth', 'storage', 'counts'].includes(mode) ||
  !projectRef ||
  projectRef !== expectedRef ||
  url !== `https://${projectRef}.supabase.co` ||
  !serviceRoleKey
) {
  fail('STAGING_CLEANUP_TARGET_INVALID');
}

const client = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function listObjects(bucketId, prefix = '') {
  const objects = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.storage.from(bucketId).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null)
        objects.push(...(await listObjects(bucketId, path)));
      else objects.push(path);
    }
    if (data.length < 1000) return objects;
  }
}

async function storageInventory() {
  const { data: buckets, error } = await client.storage.listBuckets();
  if (error) throw error;
  const inventory = [];
  for (const bucket of buckets) {
    inventory.push({
      bucket: bucket.id,
      objects: await listObjects(bucket.id),
    });
  }
  return inventory;
}

async function removeStorageObjects() {
  const inventory = await storageInventory();
  for (const { bucket, objects } of inventory) {
    for (let index = 0; index < objects.length; index += 100) {
      const { error } = await client.storage
        .from(bucket)
        .remove(objects.slice(index, index + 100));
      if (error) throw error;
    }
  }
  return inventory.reduce((count, entry) => count + entry.objects.length, 0);
}

try {
  if (mode === 'auth') {
    const users = await listUsers();
    process.stdout.write(`AUTH_USERS_BEFORE=${users.length}\n`);
    for (const user of users) {
      const { error } = await client.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }
  } else if (mode === 'storage') {
    const count = await removeStorageObjects();
    process.stdout.write(`STORAGE_OBJECTS_BEFORE=${count}\n`);
  }

  const usersAfter = (await listUsers()).length;
  const storageAfter = (await storageInventory()).reduce(
    (count, entry) => count + entry.objects.length,
    0,
  );
  process.stdout.write(`AUTH_USERS_AFTER=${usersAfter}\n`);
  process.stdout.write(`STORAGE_OBJECTS_AFTER=${storageAfter}\n`);
  if (
    (mode === 'auth' && usersAfter !== 0) ||
    (mode === 'storage' && storageAfter !== 0) ||
    (mode === 'counts' && (usersAfter !== 0 || storageAfter !== 0))
  ) {
    fail('STAGING_CLEANUP_INCOMPLETE');
  }
} catch {
  fail('STAGING_CLEANUP_FAILED');
}
