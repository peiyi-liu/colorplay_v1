#!/usr/bin/env node
import process from 'node:process';

process.stderr.write('UNSAFE_BOOTSTRAP_RETIRED\n');
process.exitCode = 1;
