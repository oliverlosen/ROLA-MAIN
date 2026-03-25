import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams, Link } from "wouter";
import { ArrowLeft, Mail, Pencil, Phone, Plus, Users, BriefcaseBusiness, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type { AccountWithDetails, CrmCampaign, CrmContact, ExecutionActivityItem } from "@shared/schema";
import { format } from "date-fns";

type AccountFormState = {
  name: string;
  description: string;
};

type ContactFormState = {
  name: string;
  email: string;
  jobTitle: string;
  phone: string;
  notes: string;
};

type CampaignFormState = {
  name: string;
  description: string;
  status: string;
  startDate: string;
  endDate: string;
};

const emptyAccountForm = (): AccountFormState => ({
  name: "",
  description: "",
});

const emptyContactForm = (): ContactFormState => ({
  name: "",
  email: "",
  jobTitle: "",
  phone: "",
  notes: "",
});

const emptyCampaignForm = (): CampaignFormState => ({
  name: "",
  description: "",
  status: "planning",
  startDate: "",
  endDate: "",
});

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "editor";

  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccountForm());
  const [contactForm, setContactForm] = useState<ContactFormState>(emptyContactForm());
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(emptyCampaignForm());
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CrmCampaign | null>(null);

  const { data: account, isLoading } = useQuery<AccountWithDetails>({
    queryKey: ["/api/accounts", id],
  });

  const invalidateAccount = async () => {
    await queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/accounts", id] });
  };

  const updateAccountMutation = useMutation({
    mutationFn: async (payload: AccountFormState) => {
      await apiRequest("PATCH", `/api/accounts/${id}`, payload);
    },
    onSuccess: async () => {
      await invalidateAccount();
      setAccountDialogOpen(false);
      toast({ title: t("crm.accountUpdated") });
    },
    onError: (error: any) => {
      toast({ title: t("executionForm.error"), description: error.message, variant: "destructive" });
    },
  });

  const contactMutation = useMutation({
    mutationFn: async (payload: ContactFormState) => {
      if (editingContact) {
        await apiRequest("PATCH", `/api/contacts/${editingContact.id}`, payload);
      } else {
        await apiRequest("POST", `/api/accounts/${id}/contacts`, payload);
      }
    },
    onSuccess: async () => {
      await invalidateAccount();
      setContactDialogOpen(false);
      setEditingContact(null);
      setContactForm(emptyContactForm());
      toast({ title: editingContact ? t("crm.contactUpdated") : t("crm.contactCreated") });
    },
    onError: (error: any) => {
      toast({ title: t("executionForm.error"), description: error.message, variant: "destructive" });
    },
  });

  const campaignMutation = useMutation({
    mutationFn: async (payload: CampaignFormState) => {
      const normalized = {
        ...payload,
        startDate: payload.startDate || null,
        endDate: payload.endDate || null,
      };
      if (editingCampaign) {
        await apiRequest("PATCH", `/api/campaigns/${editingCampaign.id}`, normalized);
      } else {
        await apiRequest("POST", `/api/accounts/${id}/campaigns`, normalized);
      }
    },
    onSuccess: async () => {
      await invalidateAccount();
      setCampaignDialogOpen(false);
      setEditingCampaign(null);
      setCampaignForm(emptyCampaignForm());
      toast({ title: editingCampaign ? t("crm.campaignUpdated") : t("crm.campaignCreated") });
    },
    onError: (error: any) => {
      toast({ title: t("executionForm.error"), description: error.message, variant: "destructive" });
    },
  });

  const openAccountEdit = () => {
    if (!account) return;
    setAccountForm({
      name: account.name || "",
      description: account.description || "",
    });
    setAccountDialogOpen(true);
  };

  const openContactCreate = () => {
    setEditingContact(null);
    setContactForm(emptyContactForm());
    setContactDialogOpen(true);
  };

  const openContactEdit = (contact: CrmContact) => {
    setEditingContact(contact);
    setContactForm({
      name: contact.name || "",
      email: contact.email || "",
      jobTitle: contact.jobTitle || "",
      phone: contact.phone || "",
      notes: contact.notes || "",
    });
    setContactDialogOpen(true);
  };

  const openCampaignCreate = () => {
    setEditingCampaign(null);
    setCampaignForm(emptyCampaignForm());
    setCampaignDialogOpen(true);
  };

  const openCampaignEdit = (campaign: CrmCampaign) => {
    setEditingCampaign(campaign);
    setCampaignForm({
      name: campaign.name || "",
      description: campaign.description || "",
      status: campaign.status,
      startDate: campaign.startDate || "",
      endDate: campaign.endDate || "",
    });
    setCampaignDialogOpen(true);
  };

  const campaignStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      planning: t("crm.campaignStatusPlanning"),
      active: t("crm.campaignStatusActive"),
      completed: t("crm.campaignStatusCompleted"),
      on_hold: t("crm.campaignStatusOnHold"),
    };
    return map[status] || status;
  };

  const visibleActivity = useMemo(() => (account?.activity || []).slice(0, 30), [account?.activity]);

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-[640px] w-full" /></div>;
  }

  if (!account) {
    return <div className="p-6 text-center text-muted-foreground">{t("crm.accountNotFound")}</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/accounts")} data-testid="button-back-accounts">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-account-detail-title">{account.name}</h1>
            <p className="text-sm text-muted-foreground">{t("crm.accountDetailSubtitle")}</p>
          </div>
        </div>
        {canEdit && (
          <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={openAccountEdit} data-testid="button-edit-account-detail">
                <Pencil className="w-4 h-4 mr-1" />
                {t("crm.editAccount")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("crm.editAccount")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>{t("crm.accountName")}</Label>
                  <Input value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div>
                  <Label>{t("crm.description")}</Label>
                  <Textarea value={accountForm.description} onChange={(event) => setAccountForm((current) => ({ ...current, description: event.target.value }))} rows={4} />
                </div>
                <Button className="w-full" onClick={() => updateAccountMutation.mutate(accountForm)} disabled={!accountForm.name.trim() || updateAccountMutation.isPending}>
                  {t("crm.saveAccount")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("crm.accountOverview")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">{account.description || t("crm.noDescription")}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Metric label={t("crm.contacts")} value={String(account.contactCount || 0)} />
                <Metric label={t("crm.campaigns")} value={String(account.campaignCount || 0)} />
                <Metric label={t("executions.title")} value={String(account.executionCount || 0)} />
                <Metric label={t("executions.owner")} value={account.owner?.displayName || "-"} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                {t("crm.contacts")}
              </h2>
              {canEdit && (
                <Dialog open={contactDialogOpen} onOpenChange={setContactDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={openContactCreate} data-testid="button-add-contact">
                      <Plus className="w-4 h-4 mr-1" />
                      {t("crm.addContact")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingContact ? t("crm.editContact") : t("crm.addContact")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>{t("crm.contactName")}</Label>
                        <Input value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>{t("crm.contactEmail")}</Label>
                          <Input value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} />
                        </div>
                        <div>
                          <Label>{t("crm.contactPhone")}</Label>
                          <Input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <Label>{t("crm.contactJobTitle")}</Label>
                        <Input value={contactForm.jobTitle} onChange={(event) => setContactForm((current) => ({ ...current, jobTitle: event.target.value }))} />
                      </div>
                      <div>
                        <Label>{t("crm.notes")}</Label>
                        <Textarea value={contactForm.notes} onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))} rows={3} />
                      </div>
                      <Button className="w-full" onClick={() => contactMutation.mutate(contactForm)} disabled={!contactForm.name.trim() || contactMutation.isPending}>
                        {editingContact ? t("crm.saveContact") : t("crm.createContact")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {account.contacts && account.contacts.length > 0 ? (
                <div className="space-y-3">
                  {account.contacts.map((contact) => (
                    <div key={contact.id} className="rounded-md border p-3 space-y-2" data-testid={`account-contact-${contact.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{contact.name}</p>
                          <p className="text-sm text-muted-foreground">{contact.jobTitle || "-"}</p>
                        </div>
                        {canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => openContactEdit(contact)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        {contact.email ? <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{contact.email}</span> : null}
                        {contact.phone ? <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{contact.phone}</span> : null}
                      </div>
                      {contact.notes ? <p className="text-sm whitespace-pre-wrap">{contact.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t("crm.noContacts")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <BriefcaseBusiness className="w-4 h-4" />
                {t("crm.campaigns")}
              </h2>
              {canEdit && (
                <Dialog open={campaignDialogOpen} onOpenChange={setCampaignDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={openCampaignCreate} data-testid="button-add-campaign">
                      <Plus className="w-4 h-4 mr-1" />
                      {t("crm.addCampaign")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingCampaign ? t("crm.editCampaign") : t("crm.addCampaign")}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>{t("crm.campaignName")}</Label>
                        <Input value={campaignForm.name} onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))} />
                      </div>
                      <div>
                        <Label>{t("crm.campaignStatus")}</Label>
                        <Select value={campaignForm.status} onValueChange={(value) => setCampaignForm((current) => ({ ...current, status: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="planning">{t("crm.campaignStatusPlanning")}</SelectItem>
                            <SelectItem value="active">{t("crm.campaignStatusActive")}</SelectItem>
                            <SelectItem value="completed">{t("crm.campaignStatusCompleted")}</SelectItem>
                            <SelectItem value="on_hold">{t("crm.campaignStatusOnHold")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>{t("crm.startDate")}</Label>
                          <Input type="date" value={campaignForm.startDate} onChange={(event) => setCampaignForm((current) => ({ ...current, startDate: event.target.value }))} />
                        </div>
                        <div>
                          <Label>{t("crm.endDate")}</Label>
                          <Input type="date" value={campaignForm.endDate} onChange={(event) => setCampaignForm((current) => ({ ...current, endDate: event.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <Label>{t("crm.description")}</Label>
                        <Textarea value={campaignForm.description} onChange={(event) => setCampaignForm((current) => ({ ...current, description: event.target.value }))} rows={3} />
                      </div>
                      <Button className="w-full" onClick={() => campaignMutation.mutate(campaignForm)} disabled={!campaignForm.name.trim() || campaignMutation.isPending}>
                        {editingCampaign ? t("crm.saveCampaign") : t("crm.createCampaign")}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent>
              {account.campaigns && account.campaigns.length > 0 ? (
                <div className="space-y-3">
                  {account.campaigns.map((campaign) => (
                    <div key={campaign.id} className="rounded-md border p-3 space-y-2" data-testid={`account-campaign-${campaign.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link href={`/campaigns/${campaign.id}`}>
                            <button type="button" className="font-medium text-left hover:underline">
                              {campaign.name}
                            </button>
                          </Link>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary">{campaignStatusLabel(campaign.status)}</Badge>
                            {campaign.startDate ? <span className="text-xs text-muted-foreground">{format(new Date(campaign.startDate), "MMM d, yyyy")}</span> : null}
                          </div>
                        </div>
                        {canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => openCampaignEdit(campaign)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      {campaign.description ? <p className="text-sm whitespace-pre-wrap">{campaign.description}</p> : null}
                      <div className="flex justify-end">
                        <Link href={`/campaigns/${campaign.id}`}>
                          <Button variant="ghost" size="sm">{t("crm.viewCampaign")}</Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t("crm.noCampaigns")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                {t("crm.linkedExecutions")}
              </h2>
            </CardHeader>
            <CardContent>
              {account.executions && account.executions.length > 0 ? (
                <div className="space-y-2">
                  {account.executions.map((execution) => (
                    <Link key={execution.id} href={`/executions/${execution.id}`}>
                      <button className="w-full rounded-md border p-3 text-left hover:bg-muted/60 transition-colors" data-testid={`account-execution-${execution.id}`}>
                        <p className="font-medium text-sm">{execution.brand?.name} - {execution.title?.name || t("executionDetail.untitled")}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {execution.country?.name || "-"} · {execution.executionDate ? format(new Date(execution.executionDate), "MMM d, yyyy") : "-"}
                        </p>
                      </button>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">{t("crm.noLinkedExecutions")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <h2 className="text-sm font-semibold">{t("crm.recentActivity")}</h2>
        </CardHeader>
        <CardContent>
          {visibleActivity.length > 0 ? (
            <div className="space-y-3">
              {visibleActivity.map((item, index) => (
                <ActivityRow
                  key={`${item.type}-${item.entityId}-${index}`}
                  item={item}
                  onOpen={(href) => navigate(href)}
                  openLabel={t("executions.view")}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{t("chat.noActivityYet")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function ActivityRow({ item, onOpen, openLabel }: { item: ExecutionActivityItem; onOpen: (href: string) => void; openLabel: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border p-3">
      <div className="space-y-1 min-w-0">
        <p className="text-sm font-medium">{item.title}</p>
        {item.description ? <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.description}</p> : null}
        <p className="text-xs text-muted-foreground">
          {item.actor || "System"} · {item.timestamp ? format(new Date(item.timestamp), "MMM d, yyyy h:mm a") : "-"}
        </p>
      </div>
      {item.href ? (
        <Button variant="ghost" size="sm" onClick={() => onOpen(item.href!)}>
          {openLabel}
        </Button>
      ) : null}
    </div>
  );
}
