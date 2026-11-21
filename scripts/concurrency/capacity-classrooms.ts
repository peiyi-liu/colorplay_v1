import {
  normalizeClassCode,
  CLASS_CODE_PATTERN,
} from '../../supabase/functions/_shared/account';
import { join } from 'node:path';
import { z } from 'zod';
import { createClassroomRepository } from '../../src/features/classrooms/api/classroom-repository';
import { readPrivateFunctionalFile } from './functional-runtime';
import { capacityFailure } from './capacity-scope';
import type { CapacityRuntime } from './capacity-runtime';
import type { CapacityGameActor } from './capacity-live-game';
export const capacityClassroomSchema = z.object({
  classroomId: z.uuid(),
  ownerId: z.uuid(),
  cohortSize: z.union([z.literal(40), z.literal(60)]),
  joinCode: z
    .string()
    .regex(
      /^(?:[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}|[0-9A-F]{4}(?:-[0-9A-F]{4}){3})$/u,
    ),
});
export const readCapacityPlanRecord = async (
  directory: string,
  name: string,
) => {
  if (!/^[a-z][a-z0-9-]{0,70}$/u.test(name)) return capacityFailure();
  try {
    return JSON.parse(
      await readPrivateFunctionalFile(join(directory, `${name}.json`), 16384),
    ) as unknown;
  } catch (error) {
    if (
      error instanceof Error &&
      Object.getOwnPropertyDescriptor(error, 'code')?.value === 'ENOENT'
    )
      return null;
    return capacityFailure();
  }
};
export const ensureCapacityClassrooms = async (
  runtime: CapacityRuntime,
  teacher: CapacityGameActor,
  signal: AbortSignal,
  read: typeof readCapacityPlanRecord = readCapacityPlanRecord,
) => {
  const classes = [];
  const aborted = () => signal.aborted;
  for (const size of [40, 60] as const) {
    const name = `registration-classroom-${String(size)}`,
      found = await read(runtime.journalRoot, `${name}-confirmed`);
    if (found !== null) {
      const parsed = capacityClassroomSchema.parse(found);
      if (
        parsed.ownerId !== runtime.privatePlan.actors[0]?.userId ||
        parsed.cohortSize !== size
      )
        return capacityFailure();
      classes.push(parsed);
      continue;
    }
    if (
      runtime.leg.legId !== 'fresh_registration-native_browser-40' ||
      (await read(runtime.journalRoot, `${name}-intent`)) !== null ||
      aborted()
    )
      return capacityFailure();
    const title = `容量${String(size)} ${runtime.scope.planId}`;
    await runtime.planJournal.write(`${name}-intent`, {
      cohortSize: size,
      name: title,
      ownerId: runtime.privatePlan.actors[0]?.userId,
    });
    if (aborted()) return capacityFailure();
    try {
      const created = await createClassroomRepository(
        teacher.client,
      ).createClassroom({ name: title });
      const confirmed = capacityClassroomSchema.parse({
        ...created,
        ownerId: runtime.privatePlan.actors[0]?.userId,
        cohortSize: size,
      });
      await runtime.planJournal.write(`${name}-confirmed`, confirmed);
      classes.push(confirmed);
    } catch {
      await runtime.planJournal.write(`${name}-unknown`, {
        outcome: 'UNKNOWN_RETAINED_NO_RETRY',
      });
      return capacityFailure();
    }
  }
  return classes;
};
export const capacityRegistrationClassroom = (input: unknown) => {
  const record = capacityClassroomSchema.parse(input);
  const joinCode = normalizeClassCode(record.joinCode);
  if (!CLASS_CODE_PATTERN.test(joinCode)) return capacityFailure();
  return { classroomId: record.classroomId, joinCode };
};
