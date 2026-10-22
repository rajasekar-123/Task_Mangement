export type Role = 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ActivityType = 'TASK_CREATED' | 'STATUS_CHANGED' | 'ASSIGNED' | 'MARKED_OVERDUE';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface ManagedUser extends User {
  isActive: boolean;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  contactEmail: string | null;
  _count: { projects: number };
}

export interface Project {
  id: string;
  name: string;
  description: string;
  client: { id: string; name: string };
  createdBy: { id: string; name: string };
  createdAt: string;
  _count: { tasks: number };
}

export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string | null;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  projectName: string;
  clientName: string;
  assignee: { id: string; name: string } | null;
}

export interface Activity {
  id: string;
  type: ActivityType;
  actor: { id: string; name: string } | null;
  taskId: number | null;
  taskTitle: string | null;
  projectId: string;
  projectName: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  detail: string | null;
  createdAt: string;
}

export interface TaskDetail extends Task {
  history: Activity[];
}

export interface AppNotification {
  id: string;
  type: 'TASK_ASSIGNED' | 'TASK_IN_REVIEW';
  message: string;
  taskId: number | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationList {
  data: AppNotification[];
  unreadCount: number;
}

export type StatusCounts = Record<TaskStatus, number>;

export interface AdminDashboard {
  role: 'ADMIN';
  totalProjects: number;
  totalClients: number;
  totalUsers: number;
  totalTasks: number;
  tasksByStatus: StatusCounts;
  overdueCount: number;
  onlineUsers: number;
}

export interface PmDashboard {
  role: 'PROJECT_MANAGER';
  projects: { id: string; name: string; clientName: string; totalTasks: number; doneTasks: number }[];
  tasksByPriority: Record<Priority, number>;
  upcomingThisWeek: Task[];
  overdueCount: number;
}

export interface DevDashboard {
  role: 'DEVELOPER';
  tasks: Task[];
  tasksByStatus: StatusCounts;
  overdueCount: number;
}

export type Dashboard = AdminDashboard | PmDashboard | DevDashboard;
