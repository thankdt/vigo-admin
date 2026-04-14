'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ArrowUpDown, Loader2, Lock, Unlock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Calendar } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUsers, lockUser, unlockUser } from '@/lib/api';
import type { User } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';

type SortKey = keyof User;

export function UsersTable() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingUser, setEditingUser] = React.useState<User | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(20);

  const fetchUsers = React.useCallback(async (search: string, page: number, limit: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getUsers({ search, page, limit });
      const mappedUsers: User[] = response.data.map((apiUser: any) => ({
        id: apiUser.id,
        name: apiUser.fullName, // FIX: Use fullName from the API
        email: apiUser.email || 'N/A',
        role: apiUser.role,
        status: apiUser.isLocked ? 'Inactive' : 'Active', 
        avatarUrl: `https://picsum.photos/seed/${apiUser.id}/40/40`,
        lastLogin: 'N/A',
        phone: apiUser.phone,
        isLocked: apiUser.isLocked,
        createdAt: apiUser.createdAt,
      }));
      setUsers(mappedUsers);
      // Parse pagination meta from response
      const total = response.meta?.total ?? 0;
      const apiLimit = response.meta?.limit ?? limit;
      setTotalItems(total);
      setTotalPages(Math.max(1, Math.ceil(total / apiLimit)));
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Failed to fetch users",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
        fetchUsers(searchTerm, currentPage, pageSize);
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [fetchUsers, searchTerm, currentPage, pageSize]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Reset to page 1 on search
  };

  const sortedUsers = React.useMemo(() => {
    let sortableUsers = [...users];
    if (sortConfig !== null) {
      sortableUsers.sort((a, b) => {
        const aValue = a[sortConfig.key] || '';
        const bValue = b[sortConfig.key] || '';
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableUsers;
  }, [users, sortConfig]);
  

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const handleOpenForm = (user: User | null) => {
    setEditingUser(user);
    setIsFormOpen(true);
  };
  
  const handleCloseForm = () => {
    setEditingUser(null);
    setIsFormOpen(false);
  };
  
  const handleToggleLock = async (user: User) => {
    try {
      if (user.isLocked) {
        await unlockUser(user.id);
        toast({ title: 'User Unlocked', description: `${user.name} has been unlocked.` });
      } else {
        await lockUser(user.id);
        toast({ title: 'User Locked', description: `${user.name} has been locked.` });
      }
      // Refresh user list
      fetchUsers(searchTerm, currentPage, pageSize);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: `Failed to ${user.isLocked ? 'unlock' : 'lock'} user`,
        description: err.message,
      });
    }
  }


  const UserForm = ({ user, onClose }: { user: User | null; onClose: () => void }) => {
    const isEditing = !!user;
    const [formData, setFormData] = React.useState({
      name: user?.name || '',
      email: user?.email || '',
      role: user?.role || 'USER',
      status: user?.status || 'Active',
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { id, value } = e.target;
      setFormData(prev => ({...prev, [id]: value}));
    }

    const handleSelectChange = (id: 'role' | 'status') => (value: string) => {
      setFormData(prev => ({...prev, [id]: value as any}));
    }

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      console.log('Form submitted', formData);
      toast({ title: 'Success', description: `User ${isEditing ? 'updated' : 'created'}. (Not implemented)` });
      onClose();
    }

    return (
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit User' : 'Create User'}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Make changes to the user's profile." : "Add a new user to the system."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="grid gap-4 py-4">
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name</Label>
              <Input id="name" value={formData.name} onChange={handleChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input id="email" type="email" value={formData.email} onChange={handleChange} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="role" className="text-right">Role</Label>
               <Select onValueChange={handleSelectChange('role')} defaultValue={formData.role}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="DRIVER">Driver</SelectItem>
                  <SelectItem value="USER">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">Status</Label>
              <Select onValueChange={handleSelectChange('status')} defaultValue={formData.status}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <>
      <div className="flex items-center pb-4">
        <Input
          placeholder="Tìm theo tên hoặc SĐT..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('name')}>
                  Người dùng
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
               <TableHead>
                 <Button variant="ghost" onClick={() => requestSort('phone')}>
                  SĐT
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('status')}>
                  Trạng thái
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <Button variant="ghost" onClick={() => requestSort('createdAt')}>
                  Ngày tạo
                  <ArrowUpDown className="ml-2 h-4 w-4" />
                </Button>
              </TableHead>
              <TableHead>
                <span className="sr-only">Thao tác</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-destructive">
                  {error}
                </TableCell>
              </TableRow>
            ) : sortedUsers.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                    Không tìm thấy người dùng.
                    </TableCell>
                </TableRow>
            ) : (
              sortedUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.avatarUrl} alt={user.name} data-ai-hint="person portrait" />
                      <AvatarFallback>{user.name?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="grid">
                      <span className="font-semibold">{user.name}</span>
                      <span className="text-sm text-muted-foreground">{user.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{user.phone}</TableCell>
                <TableCell>
                   <Badge variant={user.status === 'Active' ? 'default' : 'secondary'} className={user.status === 'Active' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400' : ''}>
                    {user.status === 'Active' ? 'Hoạt động' : 'Bị khóa'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                  </span>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleOpenForm(user)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleLock(user)}>
                        {user.isLocked ? (
                          <>
                            <Unlock className="mr-2 h-4 w-4" />
                            <span>Unlock</span>
                          </>
                        ) : (
                          <>
                            <Lock className="mr-2 h-4 w-4" />
                            <span>Lock</span>
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )))}
          </TableBody>
        </Table>
        {/* Pagination Controls */}
        <div className="flex items-center justify-between px-4 py-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Hiển thị</span>
            <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span>/ {totalItems} kết quả</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Trang {currentPage} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
      {isFormOpen && <UserForm user={editingUser} onClose={handleCloseForm} />}
    </>
  );
}
