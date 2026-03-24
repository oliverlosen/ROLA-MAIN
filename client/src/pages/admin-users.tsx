import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Loader2, Pencil, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { User } from "@shared/schema";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-primary text-primary-foreground",
  editor: "bg-chart-1 text-white",
  approver: "bg-chart-5 text-white",
  viewer: "bg-muted text-muted-foreground",
};

export default function AdminUsersPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<Omit<User, "password"> | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Omit<User, "password"> | null>(null);

  const { data: users, isLoading } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/users", { username, displayName, password, role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDialogOpen(false);
      setUsername("");
      setDisplayName("");
      setPassword("");
      setRole("viewer");
      toast({ title: t("adminUsers.userCreated") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editUser) return;
      const body: any = {};
      if (editDisplayName !== editUser.displayName) body.displayName = editDisplayName;
      if (editRole !== editUser.role) body.role = editRole;
      if (editPassword) body.password = editPassword;
      await apiRequest("PATCH", `/api/users/${editUser.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditDialogOpen(false);
      setEditUser(null);
      toast({ title: t("adminUsers.userUpdated") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!deleteTarget) return;
      await apiRequest("DELETE", `/api/users/${deleteTarget.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setDeleteDialogOpen(false);
      setDeleteTarget(null);
      toast({ title: t("adminUsers.userDeleted") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const openEditDialog = (u: Omit<User, "password">) => {
    setEditUser(u);
    setEditDisplayName(u.displayName);
    setEditRole(u.role);
    setEditPassword("");
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (u: Omit<User, "password">) => {
    setDeleteTarget(u);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-admin-users-title">{t("adminUsers.title")}</h1>
          <p className="text-sm text-muted-foreground">{users ? `${users.length} ${t("adminUsers.users")}` : t("app.loading")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-user">
              <Plus className="w-4 h-4 mr-1" />
              {t("adminUsers.addUser")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("adminUsers.addUser")}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("adminUsers.username")}</Label>
                <Input value={username} onChange={e => setUsername(e.target.value)} data-testid="input-new-username" />
              </div>
              <div>
                <Label>{t("adminUsers.displayName")}</Label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} data-testid="input-new-displayname" />
              </div>
              <div>
                <Label>{t("adminUsers.password")}</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-new-password" />
              </div>
              <div>
                <Label>{t("adminUsers.role")}</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger data-testid="select-new-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("adminUsers.admin")}</SelectItem>
                    <SelectItem value="editor">{t("adminUsers.editor")}</SelectItem>
                    <SelectItem value="approver">{t("adminUsers.approver")}</SelectItem>
                    <SelectItem value="viewer">{t("adminUsers.viewer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!username || !password || createMutation.isPending} data-testid="button-save-user">
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {t("adminUsers.createUser")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminUsers.username")}</TableHead>
                  <TableHead>{t("adminUsers.displayName")}</TableHead>
                  <TableHead>{t("adminUsers.role")}</TableHead>
                  <TableHead className="w-[80px]">{t("adminCatalog.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users?.map(u => (
                  <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                    <TableCell className="text-sm font-medium">{u.username}</TableCell>
                    <TableCell className="text-sm">{u.displayName}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${ROLE_COLORS[u.role] || ""}`}>{u.role.toUpperCase()}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => openEditDialog(u)} data-testid={`button-edit-user-${u.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("adminUsers.editUser")}</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-3">
              <div>
                <Label>{t("adminUsers.username")}</Label>
                <Input value={editUser.username} disabled className="opacity-60" />
              </div>
              <div>
                <Label>{t("adminUsers.displayName")}</Label>
                <Input value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)} data-testid="input-edit-displayname" />
              </div>
              <div>
                <Label>{t("adminUsers.newPassword")}</Label>
                <Input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder={t("adminUsers.leaveBlankToKeep")} data-testid="input-edit-password" />
              </div>
              <div>
                <Label>{t("adminUsers.role")}</Label>
                <Select value={editRole} onValueChange={setEditRole}>
                  <SelectTrigger data-testid="select-edit-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("adminUsers.admin")}</SelectItem>
                    <SelectItem value="editor">{t("adminUsers.editor")}</SelectItem>
                    <SelectItem value="approver">{t("adminUsers.approver")}</SelectItem>
                    <SelectItem value="viewer">{t("adminUsers.viewer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-update-user">
                  {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("adminUsers.saveChanges")}
                </Button>
                {editUser.id !== currentUser?.id && (
                  <Button variant="destructive" onClick={() => { setEditDialogOpen(false); openDeleteDialog(editUser); }} data-testid="button-delete-user-trigger">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("adminUsers.deleteUser")}</DialogTitle></DialogHeader>
          {deleteTarget && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("adminUsers.deleteConfirm")} <strong>{deleteTarget.displayName}</strong> ({deleteTarget.username})?
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} data-testid="button-cancel-delete">
                  {t("executionForm.cancel")}
                </Button>
                <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
                  {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {t("adminUsers.delete")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
