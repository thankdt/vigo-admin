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
import { MoreHorizontal, ArrowUpDown, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getDrivers, approveDriver, rejectDriver } from '@/lib/api';
import type { Driver } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';


type SortKey = keyof Driver;
type ApprovalStatus = 'pending' | 'true' | 'false';

export function DriversTable() {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<ApprovalStatus>('pending');
  
  const [dialogState, setDialogState] = React.useState<{ open: boolean; driver: Driver | null, action: 'approve' | 'reject' }>({ open: false, driver: null, action: 'approve' });
  const [rejectionReason, setRejectionReason] = React.useState('');


  const fetchDrivers = React.useCallback(async (status: ApprovalStatus, search: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDrivers({ isApproved: status, search: search });
      setDrivers(response.data);
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Failed to fetch drivers",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
        fetchDrivers(activeTab, searchTerm);
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [fetchDrivers, activeTab, searchTerm]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as ApprovalStatus);
  }

  const sortedDrivers = React.useMemo(() => {
    let sortableDrivers = [...drivers];
    if (sortConfig !== null) {
      sortableDrivers.sort((a, b) => {
        const aValue = a[sortConfig.key] as any;
        const bValue = b[sortConfig.key] as any;
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableDrivers;
  }, [drivers, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const getStatusBadge = (status: Driver['isApproved']) => {
    switch (status) {
      case 'true':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400">Approved</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'false':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const openConfirmationDialog = (driver: Driver, action: 'approve' | 'reject') => {
    setDialogState({ open: true, driver, action });
  };

  const closeConfirmationDialog = () => {
    setDialogState({ open: false, driver: null, action: 'approve' });
    setRejectionReason('');
  }

  const handleConfirmAction = async () => {
    if (!dialogState.driver) return;

    try {
      if (dialogState.action === 'approve') {
        await approveDriver(dialogState.driver.id);
        toast({ title: "Driver Approved", description: `${dialogState.driver.name} has been approved.` });
      } else {
        if (!rejectionReason) {
            toast({ title: "Reason Required", description: "Please provide a reason for rejection.", variant: "destructive" });
            return;
        }
        await rejectDriver(dialogState.driver.id, rejectionReason);
        toast({ title: "Driver Rejected", description: `${dialogState.driver.name} has been rejected.` });
      }
      fetchDrivers(activeTab, searchTerm);
      closeConfirmationDialog();
    } catch (err: any) {
        toast({
            variant: "destructive",
            title: `Failed to ${dialogState.action} driver`,
            description: err.message,
        });
    }
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center pb-4">
            <TabsList>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="true">Approved</TabsTrigger>
                <TabsTrigger value="false">Rejected</TabsTrigger>
            </TabsList>
            <div className='ml-auto'>
                <Input
                placeholder="Filter by name, phone, plate..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
                />
            </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('name')}>
                    Driver
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('isApproved')}>
                    Status
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedDrivers.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                      No drivers found for this status.
                      </TableCell>
                  </TableRow>
              ) : (
                sortedDrivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={driver.user?.avatarUrl} alt={driver.name} data-ai-hint="person portrait" />
                        <AvatarFallback>{driver.name ? driver.name.charAt(0) : '?'}</AvatarFallback>
                      </Avatar>
                      <div className="grid">
                        <span className="font-semibold">{driver.name}</span>
                        <span className="text-sm text-muted-foreground">{driver.phone}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid">
                        <span className="font-semibold">{driver.vehicle.model}</span>
                        <span className="text-sm text-muted-foreground">{driver.vehicle.plateNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(driver.isApproved)}
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
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        {driver.isApproved === 'pending' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openConfirmationDialog(driver, 'approve')}>
                               <CheckCircle className="mr-2 h-4 w-4" /> Approve
                            </DropdownMenuItem>
                             <DropdownMenuItem onClick={() => openConfirmationDialog(driver, 'reject')} className="text-destructive focus:text-destructive">
                                <XCircle className="mr-2 h-4 w-4" /> Reject
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </Card>
      </Tabs>
      
      <AlertDialog open={dialogState.open} onOpenChange={closeConfirmationDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogState.action === 'approve' 
                ? `You are about to approve the driver ${dialogState.driver?.name}. They will be notified and can start accepting bookings.`
                : `You are about to reject the driver ${dialogState.driver?.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogState.action === 'reject' && (
            <div className="grid gap-2 pt-2">
                <Label htmlFor="rejection-reason">Reason for Rejection</Label>
                <Textarea 
                    id="rejection-reason"
                    placeholder="e.g., Missing documents, blurry license photo..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={closeConfirmationDialog}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>
                {dialogState.action === 'approve' ? 'Approve' : 'Confirm Rejection'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
