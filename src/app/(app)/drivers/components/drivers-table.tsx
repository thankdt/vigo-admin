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
import { getDrivers, approveDriver, rejectDriver, API_BASE_URL } from '@/lib/api';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getImageUrl } from '@/lib/utils';

// Safely parse image arrays - handles string, comma-separated, PostgreSQL array format, etc.
function safeImageArray(images: any): string[] {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  if (typeof images === 'string') {
    // Handle PostgreSQL array format: {"a.jpg","b.jpg"}
    const trimmed = images.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed.slice(1, -1).split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
    }
    // Handle JSON string: ["a.jpg","b.jpg"]
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    // Handle comma-separated string: "a.jpg,b.jpg"
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
    // Single image path
    return trimmed ? [trimmed] : [];
  }
  return [];
}

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
  const [enabledServices, setEnabledServices] = React.useState<string[]>(['RIDE', 'CARPOOL', 'DELIVERY']);

  const [viewDriver, setViewDriver] = React.useState<Driver | null>(null);

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
      case '-': // Backend seems to return '-' for pending
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
    setEnabledServices(['RIDE', 'CARPOOL', 'DELIVERY']);
  }

  const handleConfirmAction = async () => {
    if (!dialogState.driver) return;

    const driverName = dialogState.driver.name || dialogState.driver.user?.fullName || 'Driver';

    try {
      if (dialogState.action === 'approve') {
        if (enabledServices.length === 0) {
          toast({ title: "Services Required", description: "Please select at least one service.", variant: "destructive" });
          return;
        }
        await approveDriver(dialogState.driver.id, enabledServices);
        toast({ title: "Driver Approved", description: `${driverName} has been approved.` });
      } else {
        if (!rejectionReason) {
          toast({ title: "Reason Required", description: "Please provide a reason for rejection.", variant: "destructive" });
          return;
        }
        await rejectDriver(dialogState.driver.id, rejectionReason);
        toast({ title: "Driver Rejected", description: `${driverName} has been rejected.` });
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
                sortedDrivers.map((driver) => {
                  const driverName = driver.name || driver.user?.fullName || 'Unknown Driver';
                  const driverPhone = driver.phone || driver.user?.phone || 'No Phone';
                  return (
                  <TableRow key={driver.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={driver.user?.avatarUrl || driver.user?.avatar} alt={driverName} data-ai-hint="person portrait" />
                          <AvatarFallback>{driverName.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <div className="grid">
                          <span className="font-semibold">{driverName}</span>
                          <span className="text-sm text-muted-foreground">{driverPhone}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="grid">
                        <span className="font-semibold">{driver.vehicle?.model || driver.vehicleRegistration?.model || 'N/A'}</span>
                        <span className="text-sm text-muted-foreground">{driver.vehicle?.plateNumber || driver.vehicleRegistration?.plateNumber || 'No Plate'}</span>
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
                          <DropdownMenuItem onSelect={() => setTimeout(() => setViewDriver(driver), 0)}>View Details</DropdownMenuItem>
                          {(driver.isApproved === 'pending' || driver.isApproved === '-' || activeTab === 'pending') && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => setTimeout(() => openConfirmationDialog(driver, 'approve'), 0)}>
                                <CheckCircle className="mr-2 h-4 w-4" /> Approve
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setTimeout(() => openConfirmationDialog(driver, 'reject'), 0)} className="text-destructive focus:text-destructive">
                                <XCircle className="mr-2 h-4 w-4" /> Reject
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
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
                ? `You are about to approve the driver ${dialogState.driver?.name || dialogState.driver?.user?.fullName || 'Driver'}. They will be notified and can start accepting bookings.`
                : `You are about to reject the driver ${dialogState.driver?.name || dialogState.driver?.user?.fullName || 'Driver'}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialogState.action === 'approve' && (
            <div className="grid gap-2 pt-2 pb-4">
              <Label>Enable Services</Label>
              <div className="flex flex-col gap-2 mt-2">
                {['RIDE', 'CARPOOL', 'DELIVERY'].map((service) => (
                  <div key={service} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`service-${service}`} 
                      checked={enabledServices.includes(service)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setEnabledServices([...enabledServices, service]);
                        } else {
                          setEnabledServices(enabledServices.filter(s => s !== service));
                        }
                      }}
                    />
                    <label
                      htmlFor={`service-${service}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {service === 'RIDE' ? 'Ride (Taxi)' : service === 'CARPOOL' ? 'Carpool' : 'Delivery'}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      <Dialog open={!!viewDriver} onOpenChange={(open) => !open && setViewDriver(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Driver Details</DialogTitle>
          </DialogHeader>
          {viewDriver && (
            <div className="space-y-6">
              <div className="flex items-center space-x-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={viewDriver.user?.avatarUrl || viewDriver.user?.avatar} alt={viewDriver.name || viewDriver.user?.fullName} />
                  <AvatarFallback>{(viewDriver.name || viewDriver.user?.fullName || 'Driver').charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="text-xl font-bold">{viewDriver.name || viewDriver.user?.fullName || 'Unknown Driver'}</h3>
                  <p className="text-sm text-muted-foreground">{viewDriver.phone || viewDriver.user?.phone || 'No Phone'}</p>
                  <p className="text-sm font-medium mt-1">Status: {getStatusBadge(viewDriver.isApproved)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">ID</Label>
                  <p className="font-medium text-sm break-all">{viewDriver.id}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Wallet Balance</Label>
                  <p className="font-medium text-sm">{viewDriver.walletBalance !== undefined ? `${viewDriver.walletBalance} VNĐ` : 'N/A'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">License Number</Label>
                  <p className="font-medium text-sm">{viewDriver.licenseNumber || 'N/A'}</p>
                </div>
              </div>

              {viewDriver.vehicleRegistration && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Vehicle Registration</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Plate Number</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.plateNumber}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Brand</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.brand}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Model</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.model}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Color</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicleRegistration.color}</p>
                    </div>
                  </div>
                </div>
              )}

              {viewDriver.vehicle && !viewDriver.vehicleRegistration && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Vehicle</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Plate Number</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicle.plateNumber}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Model</Label>
                      <p className="font-medium text-sm">{viewDriver.vehicle.model}</p>
                    </div>
                  </div>
                </div>
              )}

              {safeImageArray(viewDriver.cccdImages).length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">CCCD Images</h4>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {safeImageArray(viewDriver.cccdImages).map((img, idx) => (
                      <a key={idx} href={getImageUrl(img)} target="_blank" rel="noreferrer">
                        <img 
                          src={getImageUrl(img)} 
                          alt={`CCCD ${idx + 1}`} 
                          className="h-32 object-cover rounded-md border" 
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {safeImageArray(viewDriver.licenseImages).length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">License Images</h4>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                    {safeImageArray(viewDriver.licenseImages).map((img, idx) => (
                      <a key={idx} href={getImageUrl(img)} target="_blank" rel="noreferrer">
                        <img 
                          src={getImageUrl(img)} 
                          alt={`License ${idx + 1}`} 
                          className="h-32 object-cover rounded-md border" 
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {viewDriver.enabledServices && viewDriver.enabledServices.length > 0 && (
                <div className="space-y-2 border-t pt-4">
                  <h4 className="font-semibold">Enabled Services</h4>
                  <div className="flex flex-wrap gap-2">
                    {viewDriver.enabledServices.map(service => (
                      <Badge key={service} variant="outline">{service}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
