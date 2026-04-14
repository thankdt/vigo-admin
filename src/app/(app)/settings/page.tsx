
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, KeyRound, Bell, Settings as SettingsIcon } from "lucide-react";
import { SystemConfigManager } from "./components/system-config-manager";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cài đặt"
        description="Quản lý cài đặt tài khoản và tùy chọn ứng dụng."
      />
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Hồ sơ</TabsTrigger>
          <TabsTrigger value="api">Tích hợp API</TabsTrigger>
          <TabsTrigger value="notifications">Thông báo</TabsTrigger>
          <TabsTrigger value="system">Cấu hình hệ thống</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Hồ sơ</CardTitle>
              <CardDescription>Cập nhật thông tin cá nhân của bạn.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Họ và tên</Label>
                <Input id="name" defaultValue="Alex Johnson" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue="alex.j@example.com" />
              </div>
            </CardContent>
            <CardFooter>
              <Button>
                <Save className="mr-2 h-4 w-4" />
                Lưu thay đổi
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle>Tích hợp API</CardTitle>
              <CardDescription>Kết nối và quản lý API bên thứ ba.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Stripe</Label>
                  <p className="text-sm text-muted-foreground">
                    Kết nối tài khoản Stripe để xử lý thanh toán.
                  </p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="text-base">Google Analytics</Label>
                   <p className="text-sm text-muted-foreground">
                    Đồng bộ dữ liệu hành vi người dùng từ Google Analytics.
                  </p>
                </div>
                <Switch />
              </div>
            </CardContent>
            <CardFooter className="flex-col items-start gap-4">
              <Separator />
               <h3 className="font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4"/> Khóa API của bạn</h3>
               <p className="text-sm text-muted-foreground">Các khóa này được sử dụng để truy cập Vigo API.</p>
               <div className="w-full space-y-2">
                <Label htmlFor="api-key">Khóa công khai</Label>
                <Input id="api-key" readOnly defaultValue="pk_test_************************" />
               </div>
               <div className="w-full space-y-2">
                <Label htmlFor="secret-key">Khóa bí mật</Label>
                <Input id="secret-key" readOnly type="password" defaultValue="sk_test_************************" />
               </div>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Thông báo</CardTitle>
              <CardDescription>Quản lý cách bạn nhận thông báo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                    <Label className="text-base">Thông báo qua Email</Label>
                    <p className="text-sm text-muted-foreground">
                        Nhận email cho các hoạt động quan trọng của tài khoản.
                    </p>
                    </div>
                    <Switch defaultChecked />
                </div>
                 <div className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                    <Label className="text-base">Báo cáo hàng tuần</Label>
                    <p className="text-sm text-muted-foreground">
                        Nhận tóm tắt hoạt động ứng dụng mỗi thứ Hai.
                    </p>
                    </div>
                    <Switch defaultChecked />
                </div>
            </CardContent>
            <CardFooter>
              <Button>
                <Save className="mr-2 h-4 w-4" />
                Lưu tùy chọn
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="system">
            <SystemConfigManager />
        </TabsContent>

      </Tabs>
    </div>
  );
}
