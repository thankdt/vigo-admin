import type { User, Article } from './types';
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

// RBAC mock (mockRoles/allPermissions/Permission) đã bỏ — /roles nay dùng API thật
// (adminListRoles + function-catalog). Xem [[admin-rbac-frontend]].

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
