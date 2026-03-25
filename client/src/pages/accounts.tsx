import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader as AlertDialogHeaderBlock,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Building2, Loader2, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { CrmAccountWithSummary } from "@shared/schema";
import { format } from "date-fns";

type AccountFormState = {
  name: string;
  description: string;
};

const emptyForm = (): AccountFormState => ({
  name: "",
  description: "",
});

export default function AccountsPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<CrmAccountWithSummary | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyForm());

  const { data: accounts, isLoading } = useQuery<CrmAccountWithSummary[]>({
    queryKey: ["/api/accounts"],
  });

  const mutation = useMutation({
    mutationFn: async (payload: AccountFormState) => {
      if (editingAccount) {
        await apiRequest("PATCH", `/api/accounts/${editingAccount.id}`, payload);
      } else {
        await apiRequest("POST", "/api/accounts", payload);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      if (editingAccount) {
        await queryClient.invalidateQueries({ queryKey: ["/api/accounts", String(editingAccount.id)] });
      }
      setDialogOpen(false);
      setEditingAccount(null);
      setForm(emptyForm());
      toast({ title: editingAccount ? t("crm.accountUpdated") : t("crm.accountCreated") });
    },
    onError: (error: any) => {
      toast({ title: t("executionForm.error"), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editingAccount) {
        throw new Error("No account selected");
      }
      const deletedId = editingAccount.id;
      await apiRequest("DELETE", `/api/accounts/${deletedId}`);
      return deletedId;
    },
    onSuccess: async (deletedId) => {
      queryClient.setQueryData<CrmAccountWithSummary[]>(["/api/accounts"], (current) =>
        current ? current.filter((account) => account.id !== deletedId) : current,
      );
      queryClient.removeQueries({ queryKey: ["/api/accounts", String(deletedId)] });
      await queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setDialogOpen(false);
      setEditingAccount(null);
      setForm(emptyForm());
      toast({ title: t("crm.accountDeleted") });
    },
    onError: (error: any) => {
      toast({ title: t("executionForm.error"), description: error.message, variant: "destructive" });
    },
  });

  const openCreate = () => {
    setEditingAccount(null);
    setForm(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (account: CrmAccountWithSummary) => {
    setEditingAccount(account);
    setForm({
      name: account.name || "",
      description: account.description || "",
    });
    setDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-accounts-title">{t("crm.accounts")}</h1>
          <p className="text-sm text-muted-foreground">{t("crm.accountsSubtitle")}</p>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="button-new-account">
                <Plus className="w-4 h-4 mr-1" />
                {t("crm.addAccount")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingAccount ? t("crm.editAccount") : t("crm.addAccount")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("crm.accountName")}</Label>
                  <Input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    data-testid="input-account-name"
                  />
                </div>
                <div>
                  <Label>{t("crm.description")}</Label>
                  <Textarea
                    value={form.description}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    rows={4}
                    data-testid="textarea-account-description"
                  />
                </div>
                {editingAccount ? (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => mutation.mutate(form)}
                      disabled={!form.name.trim() || mutation.isPending || deleteMutation.isPending}
                      data-testid="button-save-account"
                    >
                      {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      {t("crm.saveAccount")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          disabled={mutation.isPending || deleteMutation.isPending}
                          data-testid="button-delete-account-trigger"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("crm.deleteAccount")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeaderBlock>
                          <AlertDialogTitle>{t("crm.deleteAccount")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("crm.deleteAccountConfirm")} <strong>{editingAccount.name}</strong>?
                          </AlertDialogDescription>
                        </AlertDialogHeaderBlock>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-delete-account">
                            {t("executionForm.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction asChild>
                            <Button
                              variant="destructive"
                              onClick={() => deleteMutation.mutate()}
                              disabled={deleteMutation.isPending}
                              data-testid="button-confirm-delete-account"
                            >
                              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                              {t("crm.deleteAccount")}
                            </Button>
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => mutation.mutate(form)}
                    disabled={!form.name.trim() || mutation.isPending}
                    data-testid="button-save-account"
                  >
                    {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {t("crm.createAccount")}
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((item) => (
            <Card key={item}>
              <CardContent className="p-4">
                <Skeleton className="h-32 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((account) => (
            <Card key={account.id} data-testid={`card-account-${account.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <h2 className="font-semibold truncate">{account.name}</h2>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {account.description || t("crm.noDescription")}
                  </p>
                </div>
                {canEdit && (
                  <Button variant="ghost" size="icon" onClick={() => openEdit(account)} data-testid={`button-edit-account-${account.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{account.contactCount || 0} {t("crm.contacts")}</Badge>
                  <Badge variant="secondary">{account.campaignCount || 0} {t("crm.campaigns")}</Badge>
                  <Badge variant="secondary">{account.executionCount || 0} {t("executions.title")}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{t("executions.owner")}</p>
                    <p className="font-medium">{account.owner?.displayName || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{t("crm.lastUpdated")}</p>
                    <p className="font-medium">
                      {account.updatedAt ? format(new Date(account.updatedAt), "MMM d, yyyy") : "-"}
                    </p>
                  </div>
                </div>
                <Link href={`/accounts/${account.id}`}>
                  <Button variant="outline" className="w-full" data-testid={`button-view-account-${account.id}`}>
                    {t("crm.viewAccount")}
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">{t("crm.noAccounts")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
