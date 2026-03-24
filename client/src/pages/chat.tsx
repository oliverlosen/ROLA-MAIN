import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import {
  Send, MessageSquare, FileText, Users, User as UserIcon, Plus,
  Search, Hash, AtSign, X, ArrowLeft, Globe, Film, Building2, FolderKanban
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useState, useEffect, useRef, useCallback } from "react";
import type {
  MessageWithSender, ConversationWithDetails, ExecutionWithDetails,
  TaskWithAssignee, Conversation, User
} from "@shared/schema";

type MentionResult = { type: string; id: number; name: string };

function ConversationTypeIcon({ type }: { type: string }) {
  if (type === "direct") return <UserIcon className="w-4 h-4" />;
  if (type === "group") return <Users className="w-4 h-4" />;
  return <Hash className="w-4 h-4" />;
}

function parseOptionalSelectId(value: string): number | undefined {
  if (!value || value === "none") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getConversationPreview(conversation: ConversationWithDetails, emptyLabel: string) {
  if (conversation.lastMessage) {
    return `${conversation.lastMessage.senderName ? `${conversation.lastMessage.senderName}: ` : ""}${conversation.lastMessage.body.replace(/@\[([^\]]+)\]\(\w+:\d+\)/g, "@$1")}`;
  }
  return conversation.subtitle || conversation.contextSummary || emptyLabel;
}

function NewDirectMessageDialog({ onCreated }: { onCreated: (convId: number) => void }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: allUsers } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/users"],
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations/direct", { userId: Number(selectedUserId) });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setOpen(false);
      setSelectedUserId("");
      onCreated(data.id);
    },
  });

  const otherUsers = allUsers?.filter(u => u.id !== user?.id) || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-new-dm">
          <UserIcon className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("chat.newDM")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>{t("chat.selectUser")}</Label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger data-testid="select-dm-user">
              <SelectValue placeholder={t("chat.selectUser")} />
            </SelectTrigger>
            <SelectContent>
              {otherUsers.map(u => (
                <SelectItem key={u.id} value={String(u.id)}>{u.displayName} (@{u.username})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            data-testid="button-create-dm"
            onClick={() => createMutation.mutate()}
            disabled={!selectedUserId || createMutation.isPending}
          >
            {t("chat.startChat")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewGroupDialog({ onCreated }: { onCreated: (convId: number) => void }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<number[]>([]);
  const [executionId, setExecutionId] = useState<string>("");
  const [countryId, setCountryId] = useState<string>("");
  const [titleId, setTitleId] = useState<string>("");
  const [studioId, setStudioId] = useState<string>("");

  const { data: allUsers } = useQuery<Omit<User, "password">[]>({ queryKey: ["/api/users"], enabled: open });
  const { data: executions } = useQuery<ExecutionWithDetails[]>({ queryKey: ["/api/executions"], enabled: open });
  const { data: countriesData } = useQuery<any[]>({ queryKey: ["/api/countries"], enabled: open });
  const { data: titlesData } = useQuery<any[]>({ queryKey: ["/api/titles"], enabled: open });
  const { data: studiosData } = useQuery<any[]>({ queryKey: ["/api/studios"], enabled: open });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/conversations/group", {
        name: groupName,
        memberIds: selectedMembers,
        executionId: parseOptionalSelectId(executionId),
        countryId: parseOptionalSelectId(countryId),
        titleId: parseOptionalSelectId(titleId),
        studioId: parseOptionalSelectId(studioId),
      });
      return res.json();
    },
    onSuccess: (data: Conversation) => {
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      setOpen(false);
      setGroupName("");
      setMemberSearch("");
      setSelectedMembers([]);
      setExecutionId("");
      setCountryId("");
      setTitleId("");
      setStudioId("");
      onCreated(data.id);
    },
  });

  const otherUsers = allUsers?.filter(u => u.id !== user?.id) || [];
  const filteredUsers = otherUsers.filter((candidate) => {
    if (!memberSearch.trim()) return true;
    const haystack = `${candidate.displayName} ${candidate.username}`.toLowerCase();
    return haystack.includes(memberSearch.trim().toLowerCase());
  });
  const toggleMember = (id: number) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  };

  const execList = Array.isArray(executions) ? executions : (executions as any)?.executions || [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-new-group">
          <Users className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("chat.newGroup")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>{t("chat.groupName")}</Label>
            <Input
              data-testid="input-group-name"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder={t("chat.groupNamePlaceholder")}
            />
          </div>

          <div className="space-y-1">
            <Label>{t("chat.members")}</Label>
            {selectedMembers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedMembers.map((memberId) => {
                  const member = otherUsers.find((candidate) => candidate.id === memberId);
                  if (!member) return null;
                  return (
                    <Badge
                      key={memberId}
                      variant="secondary"
                      className="flex items-center gap-1 pl-2 pr-1 py-1"
                    >
                      <span className="max-w-32 truncate">{member.displayName}</span>
                      <button
                        type="button"
                        className="rounded-full p-0.5 hover:bg-background/70"
                        onClick={() => toggleMember(memberId)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={t("chat.searchPeople")}
              data-testid="input-group-member-search"
            />
            <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1">
              {filteredUsers.map(u => (
                <div
                  key={u.id}
                  data-testid={`member-option-${u.id}`}
                  className={`flex items-center gap-2 p-1.5 rounded-md cursor-pointer text-sm ${selectedMembers.includes(u.id) ? "bg-primary/10" : "hover-elevate"}`}
                  onClick={() => toggleMember(u.id)}
                >
                  <Avatar className="w-6 h-6">
                    <AvatarFallback className="text-xs">{u.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{u.displayName}</span>
                  {selectedMembers.includes(u.id) && <Badge variant="secondary" className="text-xs">{t("chat.selected")}</Badge>}
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-xs text-muted-foreground px-1 py-2">{t("chat.noMemberResults")}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>{t("chat.groupContext")}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Select value={executionId} onValueChange={setExecutionId}>
                <SelectTrigger data-testid="select-group-execution"><SelectValue placeholder={t("chat.execution")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("chat.none")}</SelectItem>
                  {execList.slice(0, 20).map((ex: any) => (
                    <SelectItem key={ex.id} value={String(ex.id)}>{ex.brand?.name || ""} - {ex.title?.name || `#${ex.id}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger data-testid="select-group-country"><SelectValue placeholder={t("chat.country")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("chat.none")}</SelectItem>
                  {(countriesData || []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={titleId} onValueChange={setTitleId}>
                <SelectTrigger data-testid="select-group-title"><SelectValue placeholder={t("chat.titleFilter")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("chat.none")}</SelectItem>
                  {(titlesData || []).map((t: any) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={studioId} onValueChange={setStudioId}>
                <SelectTrigger data-testid="select-group-studio"><SelectValue placeholder={t("chat.studio")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("chat.none")}</SelectItem>
                  {(studiosData || []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            data-testid="button-create-group"
            onClick={() => createMutation.mutate()}
            disabled={!groupName.trim() || selectedMembers.length === 0 || createMutation.isPending}
          >
            {t("chat.createGroup")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MentionPopup({
  query,
  onSelect,
  position,
}: {
  query: string;
  onSelect: (item: MentionResult) => void;
  position: { top: number; left: number };
}) {
  const { t } = useLanguage();
  const { data: results } = useQuery<MentionResult[]>({
    queryKey: ["/api/mentions", query],
    queryFn: async () => {
      const res = await fetch(`/api/mentions?q=${encodeURIComponent(query)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: query.length >= 1,
  });

  if (!results || results.length === 0) return null;

  const typeIcons: Record<string, any> = {
    user: <UserIcon className="w-3 h-3 shrink-0" />,
    country: <Globe className="w-3 h-3 shrink-0" />,
    title: <Film className="w-3 h-3 shrink-0" />,
    studio: <Building2 className="w-3 h-3 shrink-0" />,
    brand: <Hash className="w-3 h-3 shrink-0" />,
    project: <FolderKanban className="w-3 h-3 shrink-0" />,
  };

  const typeLabels: Record<string, string> = {
    user: t("chat.mentionTypePerson"),
    country: t("chat.mentionTypeCountry"),
    title: t("chat.mentionTypeMovie"),
    studio: t("chat.mentionTypeStudio"),
    brand: t("chat.mentionTypeBrand"),
    project: t("chat.mentionTypeProject"),
  };

  return (
    <div
      className="absolute z-50 bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto w-56"
      style={{ bottom: position.top, left: position.left }}
      data-testid="mention-popup"
    >
      {results.map((item, i) => (
        <div
          key={`${item.type}-${item.id}`}
          data-testid={`mention-item-${item.type}-${item.id}`}
          className="flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover-elevate"
          onClick={() => onSelect(item)}
        >
          {typeIcons[item.type] || <Hash className="w-3 h-3 shrink-0" />}
          <span className="truncate">{item.name}</span>
          <Badge variant="secondary" className="ml-auto text-xs shrink-0">{typeLabels[item.type] || item.type}</Badge>
        </div>
      ))}
    </div>
  );
}

function renderMessageBody(body: string) {
  const mentionRegex = /@\[([^\]]+)\]\((\w+):(\d+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    const [, name, type, id] = match;
    const badge = (
      <span
        key={`${type}-${id}-${match.index}`}
        className="inline-flex items-center gap-0.5 bg-primary/15 rounded px-1 font-medium text-xs text-[#d9ff05]"
      >
        <AtSign className="w-3 h-3" />
        {name}
      </span>
    );

    if (type === "project") {
      parts.push(
        <Link key={`${type}-${id}-${match.index}`} href={`/executions/${id}`}>
          {badge}
        </Link>
      );
    } else {
      parts.push(badge);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return parts.length > 0 ? parts : body;
}

function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: conversations, isLoading } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations"],
    refetchInterval: 5000,
  });

  const filtered = conversations?.filter(c => {
    if (!searchTerm) return true;
    const name = (c.displayName || c.executionName || c.name || "").toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  }) || [];

  const directConvs = filtered.filter(c => c.type === "direct");
  const executionConvs = filtered.filter(c => c.type === "execution");
  const groupConvs = filtered.filter(c => c.type === "group");

  const renderSection = (title: string, items: ConversationWithDetails[], testId: string) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-1">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2" data-testid={`text-section-${testId}`}>
          {title}
        </p>
        {items.map(conv => (
          <div
            key={conv.id}
            data-testid={`conversation-item-${conv.id}`}
            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer ${selectedId === conv.id ? "bg-primary/10" : "hover-elevate"}`}
            onClick={() => onSelect(conv.id)}
          >
            <Avatar className="shrink-0">
              <AvatarFallback>
                {conv.type === "direct" ? (
                  conv.avatarInitials || <UserIcon className="w-4 h-4" />
                ) : conv.type === "group" ? (
                  conv.avatarInitials || <Users className="w-4 h-4" />
                ) : (
                  conv.avatarInitials || <Hash className="w-4 h-4" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <p className="font-medium text-sm truncate">{conv.displayName || conv.executionName || conv.name || `#${conv.id}`}</p>
                {conv.lastMessage?.createdAt && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(conv.lastMessage.createdAt), { addSuffix: true })}
                  </span>
                )}
              </div>
              {conv.subtitle && (
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {conv.subtitle}
                </p>
              )}
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {getConversationPreview(conv, t("chat.noActivityYet"))}
              </p>
            </div>
            {conv.unreadCount && conv.unreadCount > 0 ? (
              <Badge variant="default" className="shrink-0">{conv.unreadCount}</Badge>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full border-r">
      <div className="p-3 border-b space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold" data-testid="text-chat-title">{t("chat.title")}</h2>
          <div className="flex items-center gap-0.5">
            <NewDirectMessageDialog onCreated={onSelect} />
            <NewGroupDialog onCreated={onSelect} />
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-search-conversations"
            className="pl-8"
            placeholder={t("chat.searchChats")}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 p-4">
            <MessageSquare className="w-10 h-10" />
            <p data-testid="text-no-conversations">{t("chat.noConversations")}</p>
          </div>
        ) : (
          <>
            {renderSection(t("chat.directMessages"), directConvs, "direct")}
            {renderSection(t("chat.executionChats"), executionConvs, "execution")}
            {renderSection(t("chat.groups"), groupConvs, "group")}
          </>
        )}
      </div>
    </div>
  );
}

function MessagePanel({ conversationId }: { conversationId: number }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [messageText, setMessageText] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: conversations } = useQuery<ConversationWithDetails[]>({
    queryKey: ["/api/conversations"],
  });

  const convDetails = conversations?.find(c => c.id === conversationId);

  const { data: members } = useQuery<Omit<User, "password">[]>({
    queryKey: ["/api/conversations", String(conversationId), "members"],
    enabled: Boolean(conversationId),
  });

  const { data: messages } = useQuery<MessageWithSender[]>({
    queryKey: ["/api/conversations", String(conversationId), "messages"],
    refetchInterval: 4000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !messages) return;
    queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/conversations/unread-count"] });
  }, [conversationId, messages]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/conversations/${conversationId}/messages`, {
        body: messageText,
      });
    },
    onSuccess: () => {
      setMessageText("");
      setMentionQuery(null);
      queryClient.invalidateQueries({ queryKey: ["/api/conversations", String(conversationId), "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/conversations/unread-count"] });
    },
  });

  const handleSend = () => {
    if (!messageText.trim()) return;
    sendMutation.mutate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessageText(val);

    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || atIndex === 0) {
        const queryText = textBeforeCursor.slice(atIndex + 1);
        if (!queryText.includes(" ") && queryText.length <= 30) {
          setMentionQuery(queryText);
          setMentionStart(atIndex);
          return;
        }
      }
    }
    setMentionQuery(null);
  };

  const handleMentionSelect = (item: MentionResult) => {
    const before = messageText.slice(0, mentionStart);
    const after = messageText.slice(mentionStart + (mentionQuery?.length || 0) + 1);
    const mentionToken = `@[${item.name}](${item.type}:${item.id})`;
    setMessageText(before + mentionToken + " " + after);
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const displayName = convDetails?.displayName || convDetails?.executionName || convDetails?.name || `Conversation #${conversationId}`;
  const headerSubtitle = convDetails?.subtitle || (convDetails?.type === "direct" ? t("chat.directConversation") : null);
  const headerContextTags = convDetails?.contextSummary?.split(" · ").filter(Boolean) || [];
  const participantPreview = members?.filter((member) => member.id !== user?.id).slice(0, 4) || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
        <Link href="/chat" className="md:hidden">
          <Button variant="ghost" size="icon" data-testid="button-back-chat">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <Avatar className="shrink-0">
          <AvatarFallback>
            <ConversationTypeIcon type={convDetails?.type || "execution"} />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" data-testid="text-chat-header">{displayName}</p>
          {headerSubtitle && (
            <p className="text-xs text-muted-foreground truncate">{headerSubtitle}</p>
          )}
        </div>
        {convDetails?.memberCount ? (
          <Badge variant="secondary" className="shrink-0">
            {convDetails.memberCount} {t("chat.membersLabel")}
          </Badge>
        ) : null}
      </div>

      {(headerContextTags.length > 0 || participantPreview.length > 0) && (
        <div className="px-4 py-2 border-b bg-muted/20 space-y-2">
          {headerContextTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {headerContextTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px] font-medium">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          {convDetails?.type === "group" && participantPreview.length > 0 && (
            <p className="text-xs text-muted-foreground truncate">
              {participantPreview.map((member) => member.displayName).join(", ")}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!messages || messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <MessageSquare className="w-10 h-10" />
            <p data-testid="text-no-messages">{t("chat.noMessages")}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            return (
              <div
                key={msg.id}
                data-testid={`message-item-${msg.id}`}
                className={`flex ${isMe ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex gap-2 max-w-[75%] ${isMe ? "flex-row-reverse" : ""}`}>
                  {!isMe && (
                    <Avatar className="shrink-0 w-8 h-8">
                      <AvatarFallback className="text-xs">{msg.sender?.displayName?.charAt(0) || "?"}</AvatarFallback>
                    </Avatar>
                  )}
                  <div>
                    {!isMe && (
                      <p className="text-xs text-muted-foreground mb-1">{msg.sender?.displayName || "Unknown"}</p>
                    )}
                    <Card className={`${isMe ? "bg-primary text-primary-foreground" : ""}`}>
                      <CardContent className="p-3">
                        <p className="text-sm whitespace-pre-wrap">{renderMessageBody(msg.body)}</p>
                        {msg.links && msg.links.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {msg.links.map((link) => (
                              <Link
                                key={link.id}
                                href={
                                  link.entityType === "execution"
                                    ? `/executions/${link.entityId}`
                                    : `/executions/${link.executionId}`
                                }
                              >
                                <Badge variant="secondary" className="cursor-pointer">
                                  <FileText className="w-3 h-3 mr-1" />
                                  {link.entityType === "execution" ? `Exec #${link.entityId}` : `Task #${link.entityId}`}
                                </Badge>
                              </Link>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    {msg.createdAt && (
                      <p className={`text-xs text-muted-foreground mt-1 ${isMe ? "text-right" : ""}`}>
                        {format(new Date(msg.createdAt), "h:mm a")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-3 shrink-0">
        <div className="relative">
          {mentionQuery !== null && (
            <MentionPopup
              query={mentionQuery}
              onSelect={handleMentionSelect}
              position={{ top: 8, left: 0 }}
            />
          )}
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              data-testid="input-chat-message"
              placeholder={t("chat.typeMessage")}
              value={messageText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="flex-1 resize-none min-h-[40px] max-h-[120px]"
              rows={1}
            />
            <Button
              data-testid="button-send-message"
              size="icon"
              onClick={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending}
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            {t("chat.mentionHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <MessageSquare className="w-12 h-12" />
      <p className="text-lg font-medium" data-testid="text-empty-state">{t("chat.selectConversation")}</p>
      <p className="text-sm">{t("chat.selectConversationDesc")}</p>
    </div>
  );
}

export default function ChatPage() {
  const params = useParams<{ conversationId?: string }>();
  const [, navigate] = useLocation();
  const conversationId = params.conversationId ? Number(params.conversationId) : undefined;

  const handleSelect = (id: number) => {
    navigate(`/chat/${id}`);
  };

  return (
    <div className="flex h-full" data-testid="chat-page">
      <div className={`w-80 shrink-0 ${conversationId ? "hidden md:flex md:flex-col" : "flex flex-col w-full md:w-80"}`}>
        <ConversationList selectedId={conversationId} onSelect={handleSelect} />
      </div>
      <div className={`flex-1 min-w-0 ${!conversationId ? "hidden md:flex md:flex-col" : "flex flex-col"}`}>
        {conversationId ? (
          <MessagePanel conversationId={conversationId} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
