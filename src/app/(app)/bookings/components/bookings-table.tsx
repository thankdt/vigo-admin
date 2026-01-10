'use client';

import * as React from 'react';
import { format } from 'date-fns';
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
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { Button } from '@/components/ui/button';
import { MoreHorizontal, ArrowUpDown, Loader2, Search, Car, User, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getBookings, getBookingDetails, updateBookingStatus, getAvailableDrivers, reassignBooking } from '@/lib/api';
import type { Booking, BookingStatus, Driver } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

type SortKey = keyof Booking;
const allStatuses: BookingStatus[] = ['SEARCHING', 'ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

function BookingDetail({ bookingId, open, onOpenChange }: { bookingId: number, open: boolean, onOpenChange: (open: boolean) => void }) {
    const [booking, setBooking] = React.useState<Booking | null>(null);
    const [isLoading, setIsLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const { toast } = useToast();

    React.useEffect(() => {
        const fetchDetails = async () => {
            if (!bookingId || !open) return;
            setIsLoading(true);
            setError(null);
            try {
                const details = await getBookingDetails(bookingId);
                setBooking(details);
            } catch (err: any) {
                setError(err.message);
                toast({ variant: 'destructive', title: 'Failed to fetch details', description: err.message });
            } finally {
                setIsLoading(false);
            }
        };
        
        if (open) {
          fetchDetails();
        }
    }, [bookingId, open, toast]);

    return (
       <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Booking Details</DialogTitle>
                <DialogDescription>
                    Detailed information for booking #{bookingId}.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                {isLoading && <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}
                {error && <p className="text-destructive text-center">{error}</p>}
                {booking && (
                     <div className="space-y-4 text-sm">
                        <div className="font-semibold">Customer: <span className="font-normal">{booking.customer.name} ({booking.customer.phone})</span></div>
                        <div className="font-semibold">Driver: <span className="font-normal">{booking.driver ? `${booking.driver.name} (${booking.driver.phone})` : 'N/A'}</span></div>
                        <div className="font-semibold">From: <span className="font-normal">{typeof booking.pickupAddress === 'object' ? booking.pickupAddress.address : booking.pickupAddress}</span></div>
                        <div className="font-semibold">To: <span className="font-normal">{typeof booking.destinationAddress === 'object' ? booking.destinationAddress.address : booking.destinationAddress}</span></div>
                        <div className="font-semibold">Price: <span className="font-normal">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.price)}</span></div>
                        <div className="font-semibold">Status: {getStatusBadge(booking.status)}</div>
                        <div className="font-semibold">Created At: <span className="font-normal">{format(new Date(booking.createdAt), "dd/MM/yyyy HH:mm")}</span></div>
                    </div>
                )}
            </div>
        </DialogContent>
    );
}

function ReassignDialog({ booking, open, onOpenChange, onReassignSuccess }: { booking: Booking | null, open: boolean, onOpenChange: (open: boolean) => void, onReassignSuccess: () => void }) {
    const [drivers, setDrivers] = React.useState<Driver[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isReassigning, setIsReassigning] = React.useState(false);
    const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
    const { toast } = useToast();

    React.useEffect(() => {
        const fetchDrivers = async () => {
            if (!open) return;
            setIsLoading(true);
            try {
                const response = await getAvailableDrivers();
                setDrivers(response);
            } catch (err: any) {
                 toast({ variant: 'destructive', title: 'Failed to fetch available drivers', description: err.message });
            } finally {
                setIsLoading(false);
            }
        };
        fetchDrivers();
    }, [open, toast]);

    const handleReassign = async () => {
        if (!booking || !selectedDriverId) return;
        setIsReassigning(true);
        try {
            await reassignBooking(booking.id, selectedDriverId);
            toast({ title: 'Success', description: `Booking #${booking.id} reassigned successfully.` });
            onReassignSuccess();
        } catch (err: any) {
            toast({ variant: 'destructive', title: 'Reassignment Failed', description: err.message });
        } finally {
            setIsReassigning(false);
        }
    }

    return (
        <DialogContent className="sm:max-w-lg">
            <DialogHeader>
                <DialogTitle>Reassign Booking #{booking?.id}</DialogTitle>
                <DialogDescription>Select a new driver for this booking. Only online drivers are shown.</DialogDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto p-1">
                {isLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
                ) : drivers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No available drivers found.</p>
                ) : (
                    <div className="space-y-2">
                        {drivers.map(driver => (
                            <Card 
                                key={driver.id} 
                                className={cn(
                                    "p-4 flex items-center gap-4 cursor-pointer hover:bg-muted/50",
                                    selectedDriverId === driver.user.id && "ring-2 ring-primary"
                                )}
                                onClick={() => setSelectedDriverId(driver.user.id)}
                            >
                                <Avatar className="h-12 w-12">
                                     <AvatarImage src={driver.user?.avatarUrl} alt={driver.name} data-ai-hint="person portrait" />
                                     <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className='flex-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm'>
                                    <div className="flex items-center gap-2 font-semibold"><User className="h-4 w-4 text-muted-foreground" /> {driver.name}</div>
                                    <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {driver.phone}</div>
                                    <div className="flex items-center gap-2 col-span-2"><Car className="h-4 w-4 text-muted-foreground" /> {driver.vehicle.model} ({driver.vehicle.plateNumber})</div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button onClick={handleReassign} disabled={!selectedDriverId || isReassigning}>
                    {isReassigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Confirm Reassignment
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}


function getStatusBadge(status: Booking['status']) {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-400 capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
      case 'ACCEPTED':
      case 'PICKED_UP':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-400 capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
      case 'SEARCHING':
        return <Badge variant="secondary" className="capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive" className="capitalize">{status.toLowerCase().replace('_', ' ')}</Badge>;
      default:
        return <Badge className="capitalize">{status ? status.toLowerCase().replace('_', ' ') : ''}</Badge>;
    }
  };

export function BookingsTable() {
  const [bookings, setBookings] = React.useState<Booking[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { toast } = useToast();

  const [sortConfig, setSortConfig] = React.useState<{ key: SortKey; direction: 'ascending' | 'descending' } | null>(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<string>('ALL');
  
  const [selectedBookingId, setSelectedBookingId] = React.useState<number | null>(null);
  const [isDetailOpen, setIsDetailOpen] = React.useState(false);
  const [reassigningBooking, setReassigningBooking] = React.useState<Booking | null>(null);

  const [dialogState, setDialogState] = React.useState<{ open: boolean; booking: Booking | null; newStatus: BookingStatus | null }>({ open: false, booking: null, newStatus: null });

  
  const fetchBookings = React.useCallback(async (status: string, search: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const params: any = { status: status === 'ALL' ? undefined : status };
      if (search) {
        params.customerId = search;
      }

      const response = await getBookings(params);
      setBookings(response.data);
    } catch (err: any) {
      setError(err.message);
      toast({
        variant: "destructive",
        title: "Failed to fetch bookings",
        description: err.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);
  
  React.useEffect(() => {
    const timer = setTimeout(() => {
        fetchBookings(activeTab, searchTerm);
    }, 500); // Debounce search

    return () => clearTimeout(timer);
  }, [fetchBookings, activeTab, searchTerm]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as string);
  }

  const openDetails = (bookingId: number) => {
    setSelectedBookingId(bookingId);
    setIsDetailOpen(true);
  }

  const handleStatusUpdate = async () => {
    if (!dialogState.booking || !dialogState.newStatus) return;

    try {
        await updateBookingStatus(dialogState.booking.id, dialogState.newStatus);
        toast({ title: 'Status Updated', description: `Booking #${dialogState.booking.id} has been updated to ${dialogState.newStatus}.` });
        fetchBookings(activeTab, searchTerm);
    } catch(err: any) {
        toast({ variant: 'destructive', title: 'Failed to update status', description: err.message });
    } finally {
        setDialogState({ open: false, booking: null, newStatus: null });
    }
  }

  const openConfirmationDialog = (booking: Booking, newStatus: BookingStatus) => {
    setDialogState({ open: true, booking, newStatus });
  }

  const sortedBookings = React.useMemo(() => {
    let sortableBookings = [...bookings];
    if (sortConfig !== null) {
      sortableBookings.sort((a, b) => {
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
    return sortableBookings;
  }, [bookings, sortConfig]);

  const requestSort = (key: SortKey) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const statusChangeOptions: BookingStatus[] = ['ACCEPTED', 'PICKED_UP', 'COMPLETED', 'CANCELLED'];

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center pb-4">
            <TabsList className='flex-wrap h-auto'>
                <TabsTrigger value="ALL">All</TabsTrigger>
                {allStatuses.map(status => (
                  <TabsTrigger key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace('_', ' ')}</TabsTrigger>
                ))}
            </TabsList>
            <div className='ml-auto relative'>
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                placeholder="Search by Customer/Driver ID"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm pl-8"
                />
            </div>
        </div>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('price')}>
                    Price
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('createdAt')}>
                    Date
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" onClick={() => requestSort('status')}>
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
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : sortedBookings.length === 0 ? (
                  <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                      No bookings found.
                      </TableCell>
                  </TableRow>
              ) : (
                sortedBookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell className="font-medium">
                     <div className="flex flex-col">
                        <span className='font-semibold'>{booking.customer.name}</span>
                        <span className='text-sm text-muted-foreground'>{booking.customer.phone}</span>
                     </div>
                  </TableCell>
                  <TableCell>
                     {booking.driver ? (
                        <div className="flex flex-col">
                            <span className='font-semibold'>{booking.driver.name}</span>
                            <span className='text-sm text-muted-foreground'>{booking.driver.phone}</span>
                        </div>
                     ) : (
                        <span className='text-sm text-muted-foreground'>N/A</span>
                     )}
                  </TableCell>
                  <TableCell className='max-w-xs'>
                      <div className="flex flex-col">
                          <span className='truncate'><span className='font-medium'>From:</span> {typeof booking.pickupAddress === 'object' ? booking.pickupAddress.address : booking.pickupAddress}</span>
                          <span className='truncate'><span className='font-medium'>To:</span> {typeof booking.destinationAddress === 'object' ? booking.destinationAddress.address : booking.destinationAddress}</span>
                      </div>
                  </TableCell>
                  <TableCell>
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(booking.price)}
                  </TableCell>
                  <TableCell>
                    {format(new Date(booking.createdAt), "dd/MM/yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(booking.status)}
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
                          <DropdownMenuItem onSelect={() => openDetails(booking.id)}>View Details</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setReassigningBooking(booking)} disabled={booking.status === 'COMPLETED' || booking.status === 'CANCELLED'}>
                            Reassign Driver
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Update Status</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {statusChangeOptions.map(status => (
                                    <DropdownMenuItem 
                                        key={status} 
                                        disabled={booking.status === status || booking.status === 'COMPLETED' || booking.status === 'CANCELLED'}
                                        onSelect={() => openConfirmationDialog(booking, status)}
                                    >
                                        Set as {status.charAt(0) + status.slice(1).toLowerCase().replace('_', ' ')}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </Card>
      </Tabs>
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        {selectedBookingId && <BookingDetail bookingId={selectedBookingId} open={isDetailOpen} onOpenChange={setIsDetailOpen} />}
      </Dialog>
       <AlertDialog open={dialogState.open} onOpenChange={(open) => setDialogState(prev => ({...prev, open}))}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
                    <AlertDialogDescription>
                        Are you sure you want to change the status of booking #{dialogState.booking?.id} to "{dialogState.newStatus?.toLowerCase().replace('_', ' ')}"?
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDialogState({ open: false, booking: null, newStatus: null })}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleStatusUpdate}>Confirm</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        <Dialog open={!!reassigningBooking} onOpenChange={(open) => !open && setReassigningBooking(null)}>
            <ReassignDialog 
                booking={reassigningBooking}
                open={!!reassigningBooking}
                onOpenChange={(open) => !open && setReassigningBooking(null)}
                onReassignSuccess={() => {
                    setReassigningBooking(null);
                    fetchBookings(activeTab, searchTerm);
                }}
            />
        </Dialog>
    </>
  );
}
