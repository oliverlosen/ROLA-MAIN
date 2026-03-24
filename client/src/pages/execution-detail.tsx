import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Pencil, Check, X, Plus, Link as LinkIcon, FileText, Clock, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { CURRENCY_SYMBOLS } from "@shared/schema";
import type { ExecutionWithDetails, Asset, StatusHistoryEntry, TaskWithAssignee, User } from "@shared/schema";
import { format } from "date-fns";
import { useState } from "react";

const STATUS_ORDER = ["draft", "in_review", "approved", "executed", "evidence_uploaded", "closed"];

const STATUS_BADGE_VARIANT: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  executed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  evidence_uploaded: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  closed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
};

function formatUSD(val: number | string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(val));
}

export default function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [assetUrl, setAssetUrl] = useState("");
  const [assetType, setAssetType] = useState("other");
  const [assetDesc, setAssetDesc] = useState("");
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState<string>("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskStatus, setTaskStatus] = useState("pending");
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [editingStatusTaskId, setEditingStatusTaskId] = useState<number | null>(null);

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      draft: t("status.draft"),
      in_review: t("status.inReview"),
      approved: t("status.approved"),
      executed: t("status.executed"),
      evidence_uploaded: t("status.evidenceUploaded"),
      closed: t("status.closedReported"),
    };
    return map[s] || s;
  };

  const typeLabel = (tp: string) => {
    const map: Record<string, string> = {
      canje: t("executionType.canje"),
      publicity: t("executionType.publicity"),
      third_party: t("executionType.thirdParty"),
    };
    return map[tp] || tp;
  };

  const { data: exec, isLoading } = useQuery<ExecutionWithDetails>({
    queryKey: ["/api/executions", id],
  });

  const { data: assets } = useQuery<Asset[]>({
    queryKey: ["/api/executions", id, "assets"],
  });

  const { data: history } = useQuery<(StatusHistoryEntry & { changedByName?: string })[]>({
    queryKey: ["/api/executions", id, "history"],
  });

  const { data: tasksList } = useQuery<TaskWithAssignee[]>({
    queryKey: ["/api/executions", id, "tasks"],
  });

  const { data: allUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      await apiRequest("PATCH", `/api/executions/${id}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/executions", id, "history"] });
      toast({ title: t("executionDetail.statusUpdated") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const addAssetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/executions/${id}/assets`, {
        url: assetUrl,
        assetType,
        description: assetDesc,
        uploadedBy: user?.id,
        executionId: Number(id),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions", id, "assets"] });
      setAddAssetOpen(false);
      setAssetUrl("");
      setAssetType("other");
      setAssetDesc("");
      toast({ title: t("executionDetail.assetAdded") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      const data: Record<string, unknown> = {
        title: taskTitle,
        executionId: Number(id),
        status: taskStatus,
        createdBy: user?.id,
      };
      if (taskDescription) data.description = taskDescription;
      if (taskAssignedTo) data.assignedTo = Number(taskAssignedTo);
      if (taskDueDate) data.dueDate = taskDueDate;
      await apiRequest("POST", `/api/executions/${id}/tasks`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions", id, "tasks"] });
      setAddTaskOpen(false);
      setTaskTitle("");
      setTaskDescription("");
      setTaskAssignedTo("");
      setTaskDueDate("");
      setTaskStatus("pending");
      toast({ title: t("tasks.addTask") });
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: number; status: string }) => {
      await apiRequest("PATCH", `/api/tasks/${taskId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions", id, "tasks"] });
      setEditingStatusTaskId(null);
    },
    onError: (e: any) => toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" }),
  });

  const TASK_STATUS_BADGE: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const taskStatusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending: t("tasks.statusPending"),
      in_progress: t("tasks.statusInProgress"),
      completed: t("tasks.statusCompleted"),
      cancelled: t("tasks.statusCancelled"),
    };
    return map[s] || s;
  };

  const canEdit = user?.role === "admin" || user?.role === "editor";
  const canApprove = user?.role === "admin" || user?.role === "approver";

  if (isLoading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;
  if (!exec) return <div className="p-6 text-center text-muted-foreground">{t("executionDetail.executionNotFound")}</div>;

  const currentIdx = STATUS_ORDER.indexOf(exec.status);
  const nextStatus = currentIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIdx + 1] : null;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/executions")} data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-detail-title">
              {exec.brand?.name} - {exec.title?.name || t("executionDetail.untitled")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {exec.country?.name} · {format(new Date(exec.executionDate!), "MMMM d, yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${STATUS_BADGE_VARIANT[exec.status] || ""}`}>
            {statusLabel(exec.status)}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            data-testid="button-go-chat"
            onClick={async () => {
              try {
                const res = await apiRequest("GET", `/api/executions/${id}/conversation`);
                const conv = await res.json();
                navigate(`/chat/${conv.id}`);
              } catch (e) {
                navigate("/chat");
              }
            }}
          >
            <MessageSquare className="w-4 h-4 mr-1" />
            Chat
          </Button>
          {canEdit && (
            <Link href={`/executions/${id}/edit`}>
              <Button variant="outline" size="sm" data-testid="button-edit">
                <Pencil className="w-4 h-4 mr-1" />
                {t("executions.edit")}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("executionDetail.title")}</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <DetailRow label={t("executions.country")} value={exec.country?.name} />
                <DetailRow label={t("executions.brand")} value={exec.brand?.name} />
                <DetailRow label={t("executions.titleLabel")} value={exec.title?.name || "-"} />
                <DetailRow label={t("executionForm.studio")} value={exec.studio?.name || "-"} />
                <DetailRow label={t("executions.type")} value={typeLabel(exec.executionType)} />
                <DetailRow label={t("executions.owner")} value={exec.owner?.displayName || "-"} />
                <DetailRow label={t("executionForm.dueDate")} value={exec.dueDate ? format(new Date(exec.dueDate), "MMM d, yyyy") : "-"} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("executionDetail.mediaValue")}</h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <DetailRow label={t("executionDetail.localValue")} value={`${CURRENCY_SYMBOLS[exec.localCurrency] || ""}${Number(exec.mediaValueLocal).toLocaleString()}`} />
                <DetailRow label={t("executionDetail.currency")} value={exec.localCurrency} />
                <DetailRow label={t("executionDetail.fxRate")} value={exec.fxRateUsed} />
                <DetailRow label={t("executionDetail.fxSource")} value={exec.fxSource || "-"} />
                <div className="col-span-2 p-3 rounded-md bg-muted flex items-center justify-between">
                  <span className="text-muted-foreground">{t("executionDetail.usdValue")}</span>
                  <span className="text-xl font-bold" data-testid="text-usd-value">{formatUSD(exec.mediaValueUsd)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <h2 className="text-sm font-semibold">{t("executionDetail.checklist")}</h2>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <ChecklistItem label={t("executionDetail.clipping")} checked={exec.hasClipping || false} />
                <ChecklistItem label={t("executionDetail.photos")} checked={exec.hasPhotos || false} />
                <ChecklistItem label={t("executionDetail.links")} checked={exec.hasLinks || false} />
                <ChecklistItem label={t("executionDetail.invoice")} checked={exec.hasInvoice || false} />
                <ChecklistItem label={t("executionDetail.contract")} checked={exec.hasContract || false} />
              </div>
            </CardContent>
          </Card>

          {exec.notes && (
            <Card>
              <CardHeader className="pb-3"><h2 className="text-sm font-semibold">{t("executionDetail.notes")}</h2></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{exec.notes}</p></CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {(canEdit || canApprove) && nextStatus && (
            <Card>
              <CardHeader className="pb-3"><h2 className="text-sm font-semibold">{t("executionDetail.workflow")}</h2></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  {STATUS_ORDER.map((s, i) => (
                    <div key={s} className={`flex items-center gap-2 text-xs py-1 ${i <= currentIdx ? "text-foreground" : "text-muted-foreground"}`}>
                      <div className={`w-2 h-2 rounded-full ${i < currentIdx ? "bg-green-500" : i === currentIdx ? "bg-primary" : "bg-muted"}`} />
                      {statusLabel(s)}
                    </div>
                  ))}
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => statusMutation.mutate(nextStatus)}
                  disabled={statusMutation.isPending}
                  data-testid="button-advance-status"
                >
                  {t("executionDetail.advanceTo")} {statusLabel(nextStatus)}
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <h2 className="text-sm font-semibold">{t("executionDetail.assets")} ({assets?.length || 0})</h2>
              {canEdit && (
                <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="button-add-asset">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{t("executionDetail.addAssetLink")}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>{t("executionDetail.url")}</Label>
                        <Input value={assetUrl} onChange={e => setAssetUrl(e.target.value)} placeholder="https://..." data-testid="input-asset-url" />
                      </div>
                      <div>
                        <Label>{t("executionDetail.type")}</Label>
                        <Select value={assetType} onValueChange={setAssetType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["photo", "video", "clipping", "post", "contract", "other"].map(tp => (
                              <SelectItem key={tp} value={tp}>{tp.charAt(0).toUpperCase() + tp.slice(1)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("executionDetail.description")}</Label>
                        <Input value={assetDesc} onChange={e => setAssetDesc(e.target.value)} data-testid="input-asset-desc" />
                      </div>
                      <Button className="w-full" onClick={() => addAssetMutation.mutate()} disabled={!assetUrl || addAssetMutation.isPending} data-testid="button-save-asset">
                        {t("executionDetail.addAsset")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {assets && assets.length > 0 ? (
                <div className="space-y-2">
                  {assets.map(a => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm">
                      <LinkIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <a href={a.url || "#"} target="_blank" rel="noopener noreferrer" className="text-sm truncate block hover:underline">
                          {a.description || a.url || "Asset"}
                        </a>
                        <span className="text-xs text-muted-foreground capitalize">{a.assetType}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">{t("executionDetail.noAssetsYet")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t("executionDetail.statusHistory")}
              </h2>
            </CardHeader>
            <CardContent>
              {history && history.length > 0 ? (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="flex items-start gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <p className="font-medium">{statusLabel(h.status)}</p>
                        <p className="text-xs text-muted-foreground">
                          {h.changedByName || "System"} · {h.changedAt ? format(new Date(h.changedAt), "MMM d, yyyy h:mm a") : "-"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">{t("executionDetail.noHistory")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <h2 className="text-sm font-semibold">{t("tasks.title")} ({tasksList?.length || 0})</h2>
              {canEdit && (
                <Dialog open={addTaskOpen} onOpenChange={setAddTaskOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="button-add-task">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>{t("tasks.addTask")}</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>{t("tasks.taskTitle")}</Label>
                        <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} data-testid="input-task-title" />
                      </div>
                      <div>
                        <Label>{t("tasks.description")}</Label>
                        <Textarea value={taskDescription} onChange={e => setTaskDescription(e.target.value)} data-testid="input-task-description" />
                      </div>
                      {canEdit && (
                        <div>
                          <Label>{t("tasks.assignTo")}</Label>
                          <Select value={taskAssignedTo} onValueChange={setTaskAssignedTo}>
                            <SelectTrigger><SelectValue placeholder={t("tasks.unassigned")} /></SelectTrigger>
                            <SelectContent>
                              {allUsers?.map(u => (
                                <SelectItem key={u.id} value={String(u.id)}>{u.displayName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label>{t("tasks.dueDate")}</Label>
                        <Input type="date" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} data-testid="input-task-due-date" />
                      </div>
                      <div>
                        <Label>{t("tasks.status")}</Label>
                        <Select value={taskStatus} onValueChange={setTaskStatus}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">{t("tasks.statusPending")}</SelectItem>
                            <SelectItem value="in_progress">{t("tasks.statusInProgress")}</SelectItem>
                            <SelectItem value="completed">{t("tasks.statusCompleted")}</SelectItem>
                            <SelectItem value="cancelled">{t("tasks.statusCancelled")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button className="w-full" onClick={() => addTaskMutation.mutate()} disabled={!taskTitle || addTaskMutation.isPending} data-testid="button-save-task">
                        {t("tasks.save")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {tasksList && tasksList.length > 0 ? (
                <div className="space-y-2">
                  {tasksList.map(task => (
                    <div key={task.id} data-testid={`card-task-${task.id}`} className="rounded-md bg-muted p-2 text-sm">
                      <div
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{task.title}</p>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mt-0.5">
                            <span>{task.assignee?.displayName || t("tasks.unassigned")}</span>
                            {task.dueDate && <span>· {format(new Date(task.dueDate), "MMM d")}</span>}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-1">
                          {editingStatusTaskId === task.id ? (
                            <Select
                              value={task.status}
                              onValueChange={(val) => {
                                updateTaskStatusMutation.mutate({ taskId: task.id, status: val });
                              }}
                            >
                              <SelectTrigger className="h-6 text-xs w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">{t("tasks.statusPending")}</SelectItem>
                                <SelectItem value="in_progress">{t("tasks.statusInProgress")}</SelectItem>
                                <SelectItem value="completed">{t("tasks.statusCompleted")}</SelectItem>
                                <SelectItem value="cancelled">{t("tasks.statusCancelled")}</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge
                              className={`${TASK_STATUS_BADGE[task.status] || ""} cursor-pointer`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingStatusTaskId(task.id);
                              }}
                            >
                              {taskStatusLabel(task.status)}
                            </Badge>
                          )}
                          {expandedTaskId === task.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </div>
                      </div>
                      {expandedTaskId === task.id && (
                        <div className="mt-2 pt-2 border-t text-xs space-y-1">
                          {task.description && <p className="whitespace-pre-wrap">{task.description}</p>}
                          {task.creator && (
                            <p className="text-muted-foreground">{t("tasks.createdBy")}: {task.creator.displayName}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-3">{t("tasks.noTasks")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs">{label}</span>
      <p className="font-medium">{value || "-"}</p>
    </div>
  );
}

function ChecklistItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${checked ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-muted text-muted-foreground"}`}>
      {checked ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {label}
    </div>
  );
}
