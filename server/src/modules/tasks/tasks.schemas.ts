import { Priority, TaskStatus } from '@prisma/client';
import { z } from 'zod';

const csvEnum = <T extends Record<string, string>>(e: T) =>
  z
    .string()
    .transform((s) => s.split(',').map((v) => v.trim()).filter(Boolean))
    .pipe(z.array(z.nativeEnum(e)).min(1))
    .optional();

// Accepts "2025-03-01" (calendar date) or a full ISO timestamp.
const dateInput = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
  .optional();

export const listTasksQuery = z.object({
  status: csvEnum(TaskStatus),
  priority: csvEnum(Priority),
  dueFrom: dateInput,
  dueTo: dateInput,
  projectId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  overdue: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListTasksQuery = z.infer<typeof listTasksQuery>;

const dueDate = z.coerce.date().nullable();

export const createTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).default(''),
  assigneeId: z.string().uuid().nullable().optional(),
  status: z.nativeEnum(TaskStatus).default('TODO'),
  priority: z.nativeEnum(Priority).default('MEDIUM'),
  dueDate: dueDate.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskBody>;

export const updateTaskBody = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5000),
    assigneeId: z.string().uuid().nullable(),
    status: z.nativeEnum(TaskStatus),
    priority: z.nativeEnum(Priority),
    dueDate,
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');
export type UpdateTaskInput = z.infer<typeof updateTaskBody>;
