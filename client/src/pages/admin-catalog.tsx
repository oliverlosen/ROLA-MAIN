import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

interface CatalogItem {
  id: number;
  name: string;
  code?: string;
}

interface AdminCatalogProps {
  titleKey: string;
  singularKey?: string;
  endpoint: string;
  hasCode?: boolean;
}

export default function AdminCatalogPage({ titleKey, singularKey, endpoint, hasCode }: AdminCatalogProps) {
  const { t } = useLanguage();
  const title = t(titleKey);
  const singularName = singularKey ? t(singularKey) : title.replace(/ies$/, "y").replace(/s$/, "");
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const { data: items, isLoading } = useQuery<CatalogItem[]>({
    queryKey: [`/api/${endpoint}`],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { name };
      if (hasCode) payload.code = code;
      if (editItem) {
        await apiRequest("PATCH", `/api/${endpoint}/${editItem.id}`, payload);
      } else {
        await apiRequest("POST", `/api/${endpoint}`, payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/${endpoint}`] });
      closeDialog();
      toast({ title: editItem ? t("adminCatalog.updated") : t("adminCatalog.created") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/${endpoint}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/${endpoint}`] });
      toast({ title: t("adminCatalog.deleted") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const openDialog = (item?: CatalogItem) => {
    if (item) {
      setEditItem(item);
      setName(item.name);
      setCode(item.code || "");
    } else {
      setEditItem(null);
      setName("");
      setCode("");
    }
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditItem(null);
    setName("");
    setCode("");
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid={`text-admin-${endpoint}-title`}>{title}</h1>
          <p className="text-sm text-muted-foreground">
            {items ? `${items.length} ${t("adminCatalog.items")}` : t("app.loading")}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => openDialog()} data-testid={`button-add-${endpoint}`}>
              <Plus className="w-4 h-4 mr-1" />
              {t("adminCatalog.add")} {singularName}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editItem ? t("adminCatalog.edit") : t("adminCatalog.add")} {singularName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("adminCatalog.name")}</Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={`${singularName} name`}
                  data-testid={`input-${endpoint}-name`}
                />
              </div>
              {hasCode && (
                <div>
                  <Label>{t("adminCatalog.code")}</Label>
                  <Input
                    value={code}
                    onChange={e => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. GT"
                    maxLength={3}
                    data-testid={`input-${endpoint}-code`}
                  />
                </div>
              )}
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={!name || createMutation.isPending}
                data-testid={`button-save-${endpoint}`}
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editItem ? t("executionForm.update") : t("executionForm.create")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("adminCatalog.id")}</TableHead>
                  <TableHead>{t("adminCatalog.name")}</TableHead>
                  {hasCode && <TableHead>{t("adminCatalog.code")}</TableHead>}
                  <TableHead className="w-20">{t("adminCatalog.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items?.map(item => (
                  <TableRow key={item.id} data-testid={`row-${endpoint}-${item.id}`}>
                    <TableCell className="text-sm text-muted-foreground">{item.id}</TableCell>
                    <TableCell className="text-sm font-medium">{item.name}</TableCell>
                    {hasCode && <TableCell className="text-sm">{item.code}</TableCell>}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDialog(item)} data-testid={`button-edit-${endpoint}-${item.id}`}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(item.id)} data-testid={`button-delete-${endpoint}-${item.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={hasCode ? 4 : 3} className="text-center text-muted-foreground py-8">
                      {t("adminCatalog.noItemsYet")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
