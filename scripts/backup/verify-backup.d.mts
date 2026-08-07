export type BackupVerification = Readonly<{
  schema_version: 1;
  decision: 'pass' | 'freeze';
  capacity_level: 'ok' | 'info' | 'warning' | 'critical';
  newest_object_age_hours: number;
  checksum: 'passed';
  decryption: 'passed';
  inventory: 'passed';
  object_lock: 'passed';
}>;
