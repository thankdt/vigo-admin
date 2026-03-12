import type { User, Article, Role, Permission } from './types';
import placeholderData from './placeholder-images.json';

const { placeholderImages } = placeholderData;

const getPlaceholderImageUrl = (id: string) => {
  const image = placeholderImages.find(p => p.id === id);
  return image ? image.imageUrl : 'https://picsum.photos/seed/default/200/200';
}

export const mockUsers: User[] = [
  { id: '1', name: 'Alex Johnson', email: 'alex.j@example.com', role: 'Admin', status: 'Active', avatarUrl: getPlaceholderImageUrl('avatar1'), lastLogin: '2 hours ago', isLocked: false },
  { id: '2', name: 'Maria Garcia', email: 'maria.g@example.com', role: 'Editor', status: 'Active', avatarUrl: getPlaceholderImageUrl('avatar2'), lastLogin: '5 hours ago', isLocked: false },
  { id: '3', name: 'James Smith', email: 'james.s@example.com', role: 'Viewer', status: 'Inactive', avatarUrl: getPlaceholderImageUrl('avatar3'), lastLogin: '1 day ago', isLocked: false },
  { id: '4', name: 'Patricia Williams', email: 'patricia.w@example.com', role: 'Editor', status: 'Active', avatarUrl: getPlaceholderImageUrl('avatar4'), lastLogin: '3 days ago', isLocked: false },
  { id: '5', name: 'Robert Brown', email: 'robert.b@example.com', role: 'Viewer', status: 'Active', avatarUrl: getPlaceholderImageUrl('avatar5'), lastLogin: '1 week ago', isLocked: false },
  { id: '6', name: 'Jennifer Davis', email: 'jennifer.d@example.com', role: 'Editor', status: 'Inactive', avatarUrl: getPlaceholderImageUrl('avatar6'), lastLogin: '2 weeks ago', isLocked: false },
];

export const mockArticles: Article[] = [
  { id: '1', title: 'The Future of AI in Business', author: 'Maria Garcia', status: 'Published', createdAt: '2024-05-20', imageUrl: getPlaceholderImageUrl('article1') },
  { id: '2', title: 'A Guide to Modern Web Development', author: 'Patricia Williams', status: 'Published', createdAt: '2024-05-18', imageUrl: getPlaceholderImageUrl('article2') },
  { id: '3', title: 'Marketing Strategies for Startups', author: 'Maria Garcia', status: 'Draft', createdAt: '2024-05-15', imageUrl: getPlaceholderImageUrl('article3') },
  { id: '4', title: 'The Rise of Remote Work', author: 'Jennifer Davis', status: 'Archived', createdAt: '2024-04-10', imageUrl: getPlaceholderImageUrl('article4') },
  { id: '5', title: 'Understanding Blockchain Technology', author: 'Patricia Williams', status: 'Published', createdAt: '2024-05-22', imageUrl: getPlaceholderImageUrl('article5') },
];

const adminPermissions: Permission[] = [
  'users:create', 'users:read', 'users:update', 'users:delete',
  'content:create', 'content:read', 'content:update', 'content:delete',
  'roles:create', 'roles:read', 'roles:update', 'roles:delete',
  'reports:generate', 'analytics:view', 'settings:update'
];

const editorPermissions: Permission[] = [
  'content:create', 'content:read', 'content:update',
  'analytics:view'
];

const viewerPermissions: Permission[] = [
  'content:read', 'analytics:view'
];

export const mockRoles: Role[] = [
  { id: '1', name: 'Admin', description: 'Has full access to all features and settings.', userCount: 1, permissions: adminPermissions },
  { id: '2', name: 'Editor', description: 'Can create, edit, and manage content.', userCount: 3, permissions: editorPermissions },
  { id: '3', name: 'Viewer', description: 'Has read-only access to content and analytics.', userCount: 2, permissions: viewerPermissions },
];

export const allPermissions: Permission[] = [
  'users:create', 'users:read', 'users:update', 'users:delete',
  'content:create', 'content:read', 'content:update', 'content:delete',
  'roles:create', 'roles:read', 'roles:update', 'roles:delete',
  'reports:generate', 'analytics:view',
  'settings:update'
];

export const userSignupsData = [
  { date: 'Jan 24', "New Users": 23 },
  { date: 'Feb 24', "New Users": 45 },
  { date: 'Mar 24', "New Users": 52 },
  { date: 'Apr 24', "New Users": 78 },
  { date: 'May 24', "New Users": 95 },
  { date: 'Jun 24', "New Users": 110 },
];

export const contentPublishedData = [
  { name: 'Jan', "Published": 15, "Drafts": 5 },
  { name: 'Feb', "Published": 20, "Drafts": 8 },
  { name: 'Mar', "Published": 18, "Drafts": 12 },
  { name: 'Apr', "Published": 25, "Drafts": 7 },
  { name: 'May', "Published": 30, "Drafts": 10 },
  { name: 'Jun', "Published": 28, "Drafts": 6 },
];
