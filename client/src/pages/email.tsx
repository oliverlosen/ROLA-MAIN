import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import {
  AlertTriangle,
  Inbox,
  Link as LinkIcon,
  Mail,
  MailOpen,
  Plus,
  RefreshCw,
  Reply,
  Send,
  Unplug,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  apiRequest,
  getApiErrorInfo,
  parseJsonResponse,
  queryClient,
} from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import type {
  EmailAccountSafe,
  EmailThreadWithDetails,
  ExecutionWithDetails,
  TaskWithAssignee,
} from "@shared/schema";

type EmailProviderKey = "google" | "microsoft";

type EmailProviderStatus = {
  provider: EmailProviderKey;
  displayName: string;
  enabled: boolean;
  reason: "missing_env" | null;
  callbackUrl: string;
  missingEnv: string[];
  message: string;
};

type EmailProviderStatusResponse = {
  providers: Record<EmailProviderKey, EmailProviderStatus>;
};

const PROVIDER_KEYS: EmailProviderKey[] = ["google", "microsoft"];

const FALLBACK_PROVIDER_STATUS: Record<EmailProviderKey, EmailProviderStatus> = {
  google: {
    provider: "google",
    displayName: "Google Workspace",
    enabled: false,
    reason: null,
    callbackUrl: "",
    missingEnv: [],
    message: "",
  },
  microsoft: {
    provider: "microsoft",
    displayName: "Microsoft 365",
    enabled: false,
    reason: null,
    callbackUrl: "",
    missingEnv: [],
    message: "",
  },
};

function buildThreadSearchUrl(search: string) {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const query = params.toString();
  return query ? `/api/email/threads?${query}` : "/api/email/threads";
}

function formatThreadTimestamp(thread: EmailThreadWithDetails) {
  const latestDate = thread.latestMessage?.sentAt || thread.lastMessageAt;
  if (!latestDate) return "";
  return formatDistanceToNow(new Date(latestDate), { addSuffix: true });
}

function linkExecutionLabel(link: NonNullable<EmailThreadWithDetails["links"]>[number]) {
  const brand = link.execution?.brandName || "Execution";
  const title = link.execution?.titleName ? ` - ${link.execution.titleName}` : "";
  return `${brand}${title}`;
}

function getProviderButtonLabel(provider: EmailProviderKey) {
  return provider === "google" ? "Google" : "Microsoft 365";
}

function getProviderStatusDescription(
  providerStatus: EmailProviderStatus,
  fallbackApiMessage: string | null,
  t: (key: string) => string,
) {
  if (fallbackApiMessage) return fallbackApiMessage;
  if (providerStatus.enabled) return t("email.providerReady");
  if (providerStatus.reason === "missing_env") {
    return `${t("email.providerMissingEnv")} ${providerStatus.missingEnv.join(", ")}`;
  }
  return providerStatus.message || t("email.providerUnavailable");
}

export default function EmailPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();

  const selectedThreadId = searchParams.get("threadId");
  const composeMode = searchParams.get("compose") === "1";
  const presetExecutionId = searchParams.get("executionId") || "";
  const presetTaskId = searchParams.get("taskId") || "";
  const urlConnected = searchParams.get("connected");
  const urlError = searchParams.get("error");

  const [threadSearch, setThreadSearch] = useState("");
  const [composerTo, setComposerTo] = useState("");
  const [composerCc, setComposerCc] = useState("");
  const [composerBcc, setComposerBcc] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerExecutionId, setComposerExecutionId] = useState<string>(presetExecutionId);
  const [composerTaskId, setComposerTaskId] = useState<string>(presetTaskId);
  const [replyBody, setReplyBody] = useState("");
  const [linkExecutionId, setLinkExecutionId] = useState("");
  const [linkTaskId, setLinkTaskId] = useState("");

  useEffect(() => {
    setComposerExecutionId(presetExecutionId);
    setComposerTaskId(presetTaskId);
  }, [presetExecutionId, presetTaskId]);

  useEffect(() => {
    if (urlConnected) {
      toast({ title: t("email.connected") });
      navigate("/email", { replace: true });
    }
  }, [navigate, t, toast, urlConnected]);

  useEffect(() => {
    if (urlError) {
      toast({
        title: t("email.connectionFailed"),
        description: decodeURIComponent(urlError),
        variant: "destructive",
      });
      navigate("/email", { replace: true });
    }
  }, [navigate, t, toast, urlError]);

  const threadsUrl = useMemo(() => buildThreadSearchUrl(threadSearch), [threadSearch]);

  const providerStatusQuery = useQuery<EmailProviderStatusResponse>({
    queryKey: ["/api/email/providers/status"],
  });

  const providerStatusError = providerStatusQuery.error
    ? getApiErrorInfo(providerStatusQuery.error)
    : null;
  const apiUnavailable = Boolean(providerStatusError?.isApiUnavailable);
  const apiDiagnosticMessage = apiUnavailable
    ? t("email.apiUnavailableMessage")
    : providerStatusError?.message || null;
  const canUseEmailApi = providerStatusQuery.isSuccess;

  const { data: accounts, isLoading: loadingAccounts } = useQuery<EmailAccountSafe[]>({
    queryKey: ["/api/email/accounts"],
    enabled: canUseEmailApi,
  });

  const { data: threads, isLoading: loadingThreads } = useQuery<EmailThreadWithDetails[]>({
    queryKey: [threadsUrl],
    enabled: canUseEmailApi,
  });

  const activeAccount = accounts?.find((account) => account.status === "connected");
  const threadId = selectedThreadId ? Number(selectedThreadId) : threads?.[0]?.id;

  const { data: selectedThread, isLoading: loadingThread } = useQuery<EmailThreadWithDetails>({
    queryKey: ["/api/email/threads", String(threadId)],
    enabled: canUseEmailApi && Boolean(threadId && !composeMode),
  });

  const { data: executionsData } = useQuery<{ executions: ExecutionWithDetails[]; total: number }>({
    queryKey: ["/api/executions?page=1&limit=200"],
    enabled: canUseEmailApi,
  });

  const executionOptions = executionsData?.executions || [];

  const { data: selectedExecutionTasks } = useQuery<TaskWithAssignee[]>({
    queryKey: ["/api/executions", composerExecutionId || linkExecutionId, "tasks"],
    enabled: canUseEmailApi && Boolean(composerExecutionId || linkExecutionId),
  });

  const invalidateEmailQueries = () => queryClient.invalidateQueries({
    predicate: (query) =>
      typeof query.queryKey[0] === "string" &&
      query.queryKey[0].startsWith("/api/email"),
  });

  useEffect(() => {
    if (!selectedThreadId && threads?.length && !composeMode) {
      navigate(`/email?threadId=${threads[0].id}`, { replace: true });
    }
  }, [composeMode, navigate, selectedThreadId, threads]);

  const connectMutation = useMutation({
    mutationFn: async (provider: EmailProviderKey) => {
      const res = await apiRequest("POST", `/api/email/accounts/${provider}/connect`);
      return parseJsonResponse<{ authUrl: string }>(res);
    },
    onSuccess: (data) => {
      window.location.href = data.authUrl;
    },
    onError: (error: unknown) => {
      const info = getApiErrorInfo(error);
      const details = info.details && typeof info.details === "object"
        ? info.details as Record<string, unknown>
        : null;
      const callbackUrl = typeof details?.callbackUrl === "string" ? details.callbackUrl : null;
      const description = callbackUrl
        ? `${info.message} ${t("email.callbackUrlLabel")} ${callbackUrl}`
        : info.message;

      toast({
        title: t("email.connectionFailed"),
        description,
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await apiRequest("POST", `/api/email/accounts/${accountId}/sync`);
      return parseJsonResponse(res);
    },
    onSuccess: () => {
      invalidateEmailQueries();
      toast({ title: t("email.synced") });
    },
    onError: (error: unknown) => {
      toast({
        title: t("executionForm.error"),
        description: getApiErrorInfo(error).message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: number) => {
      await apiRequest("DELETE", `/api/email/accounts/${accountId}`);
    },
    onSuccess: () => {
      invalidateEmailQueries();
      toast({ title: t("email.disconnected") });
    },
    onError: (error: unknown) => {
      toast({
        title: t("executionForm.error"),
        description: getApiErrorInfo(error).message,
        variant: "destructive",
      });
    },
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email/messages/send", {
        to: composerTo,
        cc: composerCc,
        bcc: composerBcc,
        subject: composerSubject,
        body: composerBody,
        executionId: composerExecutionId ? Number(composerExecutionId) : undefined,
        taskId: composerTaskId ? Number(composerTaskId) : undefined,
      });
      return parseJsonResponse<EmailThreadWithDetails>(res);
    },
    onSuccess: (thread) => {
      invalidateEmailQueries();
      setComposerTo("");
      setComposerCc("");
      setComposerBcc("");
      setComposerSubject("");
      setComposerBody("");
      setComposerTaskId("");
      toast({ title: t("email.sent") });
      navigate(`/email?threadId=${thread.id}`);
    },
    onError: (error: unknown) => {
      toast({
        title: t("executionForm.error"),
        description: getApiErrorInfo(error).message,
        variant: "destructive",
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/email/threads/${threadId}/reply`, {
        body: replyBody,
      });
      return parseJsonResponse<EmailThreadWithDetails>(res);
    },
    onSuccess: () => {
      setReplyBody("");
      invalidateEmailQueries();
      toast({ title: t("email.replySent") });
    },
    onError: (error: unknown) => {
      toast({
        title: t("executionForm.error"),
        description: getApiErrorInfo(error).message,
        variant: "destructive",
      });
    },
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/email/threads/${threadId}/link`, {
        executionId: Number(linkExecutionId),
        taskId: linkTaskId ? Number(linkTaskId) : undefined,
      });
      return parseJsonResponse<EmailThreadWithDetails>(res);
    },
    onSuccess: () => {
      setLinkExecutionId("");
      setLinkTaskId("");
      invalidateEmailQueries();
      toast({ title: t("email.linked") });
    },
    onError: (error: unknown) => {
      toast({
        title: t("executionForm.error"),
        description: getApiErrorInfo(error).message,
        variant: "destructive",
      });
    },
  });

  const canSend = Boolean(
    activeAccount &&
    composerTo.trim() &&
    composerSubject.trim() &&
    composerBody.trim(),
  );
  const tasksForComposer = selectedExecutionTasks || [];

  const renderableProviders = PROVIDER_KEYS.map((provider) =>
    providerStatusQuery.data?.providers[provider] || FALLBACK_PROVIDER_STATUS[provider],
  );

  const showConnectionPanel = !activeAccount;
  const showConnectionLoading = providerStatusQuery.isLoading || (canUseEmailApi && loadingAccounts);

  return (
    <div className="p-4 md:p-6 max-w-[1500px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-email-title">{t("email.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("email.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={composeMode ? "default" : "outline"}
            size="sm"
            onClick={() => navigate("/email?compose=1")}
            disabled={apiUnavailable}
            data-testid="button-email-compose"
          >
            <Plus className="w-4 h-4 mr-1" />
            {t("email.compose")}
          </Button>
        </div>
      </div>

      {providerStatusQuery.isError && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="font-medium">{t("email.apiUnavailableTitle")}</p>
                <p className="text-sm text-muted-foreground">{apiDiagnosticMessage}</p>
                {apiUnavailable && (
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{t("email.apiUnavailableHint")}</p>
                    <code className="inline-flex rounded bg-background px-2 py-1 font-mono">npm run dev</code>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          {showConnectionLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : activeAccount ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="font-medium">{activeAccount.emailAddress}</span>
                  <Badge variant="secondary" className="capitalize">{activeAccount.provider}</Badge>
                  {activeAccount.readOnly && <Badge variant="outline">{t("email.readOnly")}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeAccount.lastSyncAt
                    ? `${t("email.lastSync")}: ${formatDistanceToNow(new Date(activeAccount.lastSyncAt), { addSuffix: true })}`
                    : t("email.neverSynced")}
                </p>
                {activeAccount.lastError && (
                  <p className="text-sm text-destructive">{activeAccount.lastError}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncMutation.mutate(activeAccount.id)}
                  disabled={syncMutation.isPending}
                  data-testid="button-email-sync"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  {t("email.sync")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate(activeAccount.id)}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-email-disconnect"
                >
                  <Unplug className="w-4 h-4 mr-1" />
                  {t("email.disconnect")}
                </Button>
              </div>
            </div>
          ) : showConnectionPanel ? (
            <div className="space-y-4">
              <div>
                <p className="font-medium">{t("email.noAccount")}</p>
                <p className="text-sm text-muted-foreground">{t("email.connectHint")}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {renderableProviders.map((providerStatus) => {
                  const disabled = connectMutation.isPending || !providerStatus.enabled || apiUnavailable;
                  return (
                    <div key={providerStatus.provider} className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium">{providerStatus.displayName}</p>
                          <p className="text-xs text-muted-foreground">{getProviderButtonLabel(providerStatus.provider)}</p>
                        </div>
                        <Badge variant={providerStatus.enabled ? "secondary" : "outline"}>
                          {providerStatus.enabled ? t("email.providerEnabled") : t("email.providerUnavailable")}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground">
                        {getProviderStatusDescription(providerStatus, apiUnavailable ? t("email.apiUnavailableShort") : null, t)}
                      </p>

                      {providerStatus.callbackUrl ? (
                        <div className="text-xs text-muted-foreground space-y-1">
                          <p>{t("email.callbackUrlLabel")}</p>
                          <code className="block rounded bg-muted px-2 py-1 break-all">
                            {providerStatus.callbackUrl}
                          </code>
                        </div>
                      ) : null}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => connectMutation.mutate(providerStatus.provider)}
                        disabled={disabled}
                        data-testid={`button-connect-${providerStatus.provider}`}
                      >
                        {getProviderButtonLabel(providerStatus.provider)}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-4">
        <Card className="h-[calc(100vh-250px)] flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4" />
              <h2 className="text-sm font-semibold">{t("email.inbox")}</h2>
            </div>
            <Input
              value={threadSearch}
              onChange={(event) => setThreadSearch(event.target.value)}
              placeholder={t("email.search")}
              disabled={!canUseEmailApi}
              data-testid="input-email-search"
            />
          </CardHeader>
          <CardContent className="pt-0 flex-1 overflow-auto space-y-2">
            {!canUseEmailApi && providerStatusQuery.isError ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10">
                <AlertTriangle className="w-10 h-10 mb-3 opacity-50" />
                <p>{t("email.apiUnavailableShort")}</p>
              </div>
            ) : loadingThreads ? (
              [1, 2, 3].map((index) => <Skeleton key={index} className="h-24 w-full" />)
            ) : threads && threads.length > 0 ? (
              threads.map((thread) => (
                <button
                  key={thread.id}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${thread.id === threadId && !composeMode ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                  onClick={() => navigate(`/email?threadId=${thread.id}`)}
                  data-testid={`email-thread-${thread.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{thread.subject || t("email.noSubject")}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {thread.account?.emailAddress}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatThreadTimestamp(thread)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {thread.latestMessage?.bodyText || thread.snippet || t("email.noPreview")}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-3">
                    {thread.pendingResponse && <Badge className="text-xs">{t("email.pendingReply")}</Badge>}
                    <Badge variant="secondary" className="text-xs">{thread.visibility}</Badge>
                    {thread.links?.slice(0, 2).map((link) => (
                      <Badge key={link.id} variant="outline" className="text-xs">
                        {linkExecutionLabel(link)}
                      </Badge>
                    ))}
                  </div>
                </button>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground py-10">
                <MailOpen className="w-10 h-10 mb-3 opacity-50" />
                <p>{t("email.noThreads")}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {composeMode ? (
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("email.compose")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {!activeAccount && (
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                  {t("email.composeNeedsAccount")}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">{t("email.to")}</label>
                  <Input
                    value={composerTo}
                    onChange={(event) => setComposerTo(event.target.value)}
                    placeholder="name@example.com, other@example.com"
                    disabled={!canUseEmailApi}
                    data-testid="input-email-to"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("email.cc")}</label>
                  <Input
                    value={composerCc}
                    onChange={(event) => setComposerCc(event.target.value)}
                    disabled={!canUseEmailApi}
                    data-testid="input-email-cc"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("email.bcc")}</label>
                  <Input
                    value={composerBcc}
                    onChange={(event) => setComposerBcc(event.target.value)}
                    disabled={!canUseEmailApi}
                    data-testid="input-email-bcc"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">{t("email.subject")}</label>
                  <Input
                    value={composerSubject}
                    onChange={(event) => setComposerSubject(event.target.value)}
                    disabled={!canUseEmailApi}
                    data-testid="input-email-subject"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">{t("email.body")}</label>
                  <Textarea
                    value={composerBody}
                    onChange={(event) => setComposerBody(event.target.value)}
                    rows={12}
                    disabled={!canUseEmailApi}
                    data-testid="input-email-body"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("email.linkExecution")}</label>
                  <Select
                    value={composerExecutionId || "none"}
                    onValueChange={(value) => {
                      setComposerExecutionId(value === "none" ? "" : value);
                      setComposerTaskId("");
                    }}
                    disabled={!canUseEmailApi}
                  >
                    <SelectTrigger data-testid="select-email-execution">
                      <SelectValue placeholder={t("email.optional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("email.optional")}</SelectItem>
                      {executionOptions.map((execution) => (
                        <SelectItem key={execution.id} value={String(execution.id)}>
                          {(execution.brand?.name || "Execution") + (execution.title?.name ? ` - ${execution.title.name}` : "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("email.linkTask")}</label>
                  <Select
                    value={composerTaskId || "none"}
                    onValueChange={(value) => setComposerTaskId(value === "none" ? "" : value)}
                    disabled={!canUseEmailApi || !composerExecutionId}
                  >
                    <SelectTrigger data-testid="select-email-task">
                      <SelectValue placeholder={t("email.optional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("email.optional")}</SelectItem>
                      {tasksForComposer.map((task) => (
                        <SelectItem key={task.id} value={String(task.id)}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => sendMutation.mutate()}
                  disabled={!canSend || sendMutation.isPending}
                  data-testid="button-email-send"
                >
                  <Send className="w-4 h-4 mr-1" />
                  {t("email.send")}
                </Button>
                <Button variant="outline" onClick={() => navigate(threadId ? `/email?threadId=${threadId}` : "/email")}>
                  {t("executionForm.cancel")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : !canUseEmailApi && providerStatusQuery.isError ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>{t("email.apiUnavailableShort")}</p>
            </CardContent>
          </Card>
        ) : loadingThread ? (
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-96 w-full" />
            </CardContent>
          </Card>
        ) : selectedThread ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedThread.subject || t("email.noSubject")}</h2>
                    <p className="text-sm text-muted-foreground">
                      {selectedThread.account?.emailAddress} · {selectedThread.pendingResponse ? t("email.pendingReply") : t("email.upToDate")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedThread.pendingResponse && <Badge>{t("email.pendingReply")}</Badge>}
                    <Badge variant="secondary" className="capitalize">{selectedThread.visibility}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {selectedThread.links?.length ? selectedThread.links.map((link) => (
                    <Badge key={link.id} variant="outline" className="text-xs">
                      {linkExecutionLabel(link)}
                      {link.task?.title ? ` · ${link.task.title}` : ""}
                    </Badge>
                  )) : (
                    <p className="text-sm text-muted-foreground">{t("email.notLinkedYet")}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("email.linkExecution")}</label>
                    <Select
                      value={linkExecutionId || "none"}
                      onValueChange={(value) => {
                        setLinkExecutionId(value === "none" ? "" : value);
                        setLinkTaskId("");
                      }}
                    >
                      <SelectTrigger data-testid="select-link-execution">
                        <SelectValue placeholder={t("email.optional")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("email.optional")}</SelectItem>
                        {executionOptions.map((execution) => (
                          <SelectItem key={execution.id} value={String(execution.id)}>
                            {(execution.brand?.name || "Execution") + (execution.title?.name ? ` - ${execution.title.name}` : "")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("email.linkTask")}</label>
                    <Select
                      value={linkTaskId || "none"}
                      onValueChange={(value) => setLinkTaskId(value === "none" ? "" : value)}
                      disabled={!linkExecutionId}
                    >
                      <SelectTrigger data-testid="select-link-task">
                        <SelectValue placeholder={t("email.optional")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t("email.optional")}</SelectItem>
                        {tasksForComposer.map((task) => (
                          <SelectItem key={task.id} value={String(task.id)}>
                            {task.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={() => linkMutation.mutate()}
                  disabled={!linkExecutionId || linkMutation.isPending}
                  variant="outline"
                  data-testid="button-link-thread"
                >
                  <LinkIcon className="w-4 h-4 mr-1" />
                  {t("email.linkThread")}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <h3 className="text-sm font-semibold">{t("email.messages")}</h3>
              </CardHeader>
              <CardContent className="space-y-3">
                {selectedThread.messages?.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg border p-4 ${message.direction === "outbound" ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}
                    data-testid={`email-message-${message.id}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="text-sm">
                        <span className="font-medium">{message.senderName || message.senderEmail || t("email.unknownSender")}</span>
                        {message.senderEmail && (
                          <span className="text-muted-foreground"> · {message.senderEmail}</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {message.sentAt ? format(new Date(message.sentAt), "MMM d, yyyy h:mm a") : ""}
                      </span>
                    </div>
                    {message.recipients?.length ? (
                      <p className="text-xs text-muted-foreground mb-3">
                        {message.recipients.map((recipient) => `${recipient.type.toUpperCase()}: ${recipient.name || recipient.email}`).join(" · ")}
                      </p>
                    ) : null}
                    <div className="text-sm whitespace-pre-wrap">
                      {message.bodyText || t("email.emptyBody")}
                    </div>
                  </div>
                ))}

                {selectedThread.canReply ? (
                  <div className="pt-2 space-y-3">
                    <label className="text-xs text-muted-foreground">{t("email.reply")}</label>
                    <Textarea value={replyBody} onChange={(event) => setReplyBody(event.target.value)} rows={6} data-testid="input-email-reply" />
                    <Button onClick={() => replyMutation.mutate()} disabled={!replyBody.trim() || replyMutation.isPending} data-testid="button-email-reply">
                      <Reply className="w-4 h-4 mr-1" />
                      {t("email.reply")}
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("email.readOnlyReplyHint")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Mail className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>{t("email.selectThread")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
