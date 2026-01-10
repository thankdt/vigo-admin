'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Edit, Plus, Users, X } from 'lucide-react';
import { mockRoles, allPermissions } from '@/lib/data';
import type { Role, Permission } from '@/lib/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

function RoleForm({ role, onSave, onCancel }: { role: Role | Partial<Role>; onSave: (role: Role) => void; onCancel: () => void }) {
  const [name, setName] = React.useState(role.name || '');
  const [description, setDescription] = React.useState(role.description || '');
  const [selectedPermissions, setSelectedPermissions] = React.useState<Permission[]>(role.permissions || []);

  const handlePermissionChange = (permission: Permission, checked: boolean) => {
    setSelectedPermissions(prev =>
      checked ? [...prev, permission] : prev.filter(p => p !== permission)
    );
  };

  const handleSubmit = () => {
    // In a real app, you'd validate and send this to a server
    const newRole: Role = {
      id: role.id || Date.now().toString(),
      name: name as Role['name'],
      description: description,
      userCount: role.userCount || 0,
      permissions: selectedPermissions,
    };
    onSave(newRole);
  };
  
  const groupedPermissions = allPermissions.reduce((acc, permission) => {
    const group = permission.split(':')[0];
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);


  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{role.id ? 'Edit Role' : 'Create Role'}</DialogTitle>
        <DialogDescription>Define the role and its access permissions.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="role-name">Role Name</Label>
          <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-description">Description</Label>
          <Input id="role-description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Permissions</Label>
          <ScrollArea className="h-72 rounded-md border p-4">
            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(([group, permissions], index) => (
                <div key={group}>
                  <h4 className="mb-2 text-sm font-medium capitalize tracking-tight">{group}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {permissions.map(p => (
                      <div key={p} className="flex items-center space-x-2">
                        <Checkbox
                          id={p}
                          checked={selectedPermissions.includes(p)}
                          onCheckedChange={(checked) => handlePermissionChange(p, !!checked)}
                        />
                        <label htmlFor={p} className="text-sm font-normal">
                          {p.split(':')[1]}
                        </label>
                      </div>
                    ))}
                  </div>
                   {index < Object.keys(groupedPermissions).length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={handleSubmit}>Save Role</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function RolesList() {
  const [roles, setRoles] = React.useState(mockRoles);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<Role | null>(null);

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setIsFormOpen(true);
  };
  
  const handleSave = (roleToSave: Role) => {
    setRoles(prevRoles => {
      const existing = prevRoles.find(r => r.id === roleToSave.id);
      if (existing) {
        return prevRoles.map(r => r.id === roleToSave.id ? roleToSave : r);
      }
      return [...prevRoles, roleToSave];
    });
    setIsFormOpen(false);
    setEditingRole(null);
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{role.name}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => handleEdit(role)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>{role.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">Permissions ({role.permissions.length}/{allPermissions.length})</div>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {role.permissions.slice(0, 5).map(p => (
                  <li key={p} className="flex items-center gap-2">
                    <Check className="h-3 w-3 text-green-500" /> <span>{p}</span>
                  </li>
                ))}
                 {role.permissions.length > 5 && (
                  <li className="flex items-center gap-2">
                    <Plus className="h-3 w-3" /> <span>and {role.permissions.length - 5} more...</span>
                  </li>
                )}
              </ul>
            </CardContent>
            <CardFooter>
                <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="mr-2 h-4 w-4" />
                    {role.userCount} users
                </div>
            </CardFooter>
          </Card>
        ))}
      </div>
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        {editingRole && <RoleForm role={editingRole} onSave={handleSave} onCancel={() => setIsFormOpen(false)} />}
      </Dialog>
    </>
  );
}
