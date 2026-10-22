import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Activity, Client, Dashboard, ManagedUser, NotificationList, Project, Task, TaskDetail } from '../api/types';
import { FEED_LIMIT } from '../context/SocketContext';

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/api/dashboard') });

/** The feed's source of truth is the database (last 20 events for this role); sockets only prepend to it. */
export const useActivity = () =>
  useQuery({ queryKey: ['activity'], queryFn: () => api.get<Activity[]>(`/api/activity?limit=${FEED_LIMIT}`) });

export const useTasks = (search: string) =>
  useQuery({ queryKey: ['tasks', search], queryFn: () => api.get<Task[]>(`/api/tasks${search ? `?${search}` : ''}`) });

export const useTask = (id: number | null) =>
  useQuery({ queryKey: ['task', id], queryFn: () => api.get<TaskDetail>(`/api/tasks/${id}`), enabled: id !== null });

export const useNotifications = () =>
  useQuery({ queryKey: ['notifications'], queryFn: () => api.get<NotificationList>('/api/notifications') });

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => api.get<Project[]>('/api/projects') });
export const useClients = (enabled = true) =>
  useQuery({ queryKey: ['clients'], queryFn: () => api.get<Client[]>('/api/clients'), enabled });
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => api.get<ManagedUser[]>('/api/users') });
export const useAssignable = (enabled = true) =>
  useQuery({ queryKey: ['assignable'], queryFn: () => api.get<{ id: string; name: string }[]>('/api/users/assignable'), enabled });
