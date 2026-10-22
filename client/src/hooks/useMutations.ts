import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Priority, Task, TaskStatus } from '../api/types';

export interface TaskInput {
  title: string;
  description: string;
  assigneeId: string | null;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: number } & Partial<TaskInput>) => api.patch<Task>(`/api/tasks/${id}`, patch),
    onSuccess: () => {
      // Sockets also push this, but invalidating makes the actor's own screen correct even if the socket is down.
      for (const key of ['tasks', 'task', 'dashboard', 'activity']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useCreateTask(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<TaskInput>) => api.post<Task>(`/api/projects/${projectId}/tasks`, input),
    onSuccess: () => {
      for (const key of ['tasks', 'dashboard', 'projects', 'activity']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.del(`/api/tasks/${id}`),
    onSuccess: () => {
      for (const key of ['tasks', 'dashboard', 'projects']) qc.invalidateQueries({ queryKey: [key] });
    },
  });
}
