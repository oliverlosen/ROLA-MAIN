import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { z } from "zod";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { CURRENCY_SYMBOLS } from "@shared/schema";
import type { Country, Brand, Title, Studio, Execution } from "@shared/schema";

const formSchema = z.object({
  countryId: z.coerce.number().min(1, "Country is required"),
  brandId: z.coerce.number().min(1, "Brand is required"),
  titleId: z.coerce.number().optional().nullable(),
  studioId: z.coerce.number().optional().nullable(),
  executionDate: z.string().min(1, "Date is required"),
  executionType: z.enum(["canje", "publicity", "third_party"]),
  mediaValueLocal: z.string().min(1, "Value is required"),
  localCurrency: z.enum(["GTQ", "USD", "HNL", "NIO", "CRC", "PAB", "BZD", "SVC"]),
  fxRateUsed: z.string().default("1"),
  fxSource: z.string().optional(),
  fxDate: z.string().optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  hasClipping: z.boolean().default(false),
  hasPhotos: z.boolean().default(false),
  hasLinks: z.boolean().default(false),
  hasInvoice: z.boolean().default(false),
  hasContract: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

export default function ExecutionFormPage() {
  const params = useParams<{ id: string }>();
  const isEdit = Boolean(params.id);
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();

  const typeLabel = (tp: string) => {
    const map: Record<string, string> = {
      canje: t("executionType.canje"),
      publicity: t("executionType.publicity"),
      third_party: t("executionType.thirdParty"),
    };
    return map[tp] || tp;
  };

  const checklistLabels: Record<string, string> = {
    hasClipping: t("executionForm.hasClipping"),
    hasPhotos: t("executionForm.hasPhotos"),
    hasLinks: t("executionForm.hasLinks"),
    hasInvoice: t("executionForm.hasInvoice"),
    hasContract: t("executionForm.hasContract"),
  };

  const { data: countries } = useQuery<Country[]>({ queryKey: ["/api/countries"] });
  const { data: brands } = useQuery<Brand[]>({ queryKey: ["/api/brands"] });
  const { data: titlesList } = useQuery<Title[]>({ queryKey: ["/api/titles"] });
  const { data: studiosList } = useQuery<Studio[]>({ queryKey: ["/api/studios"] });

  const { data: existing, isLoading: loadingExisting } = useQuery<Execution>({
    queryKey: ["/api/executions", params.id],
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      countryId: 0,
      brandId: 0,
      titleId: null,
      studioId: null,
      executionDate: "",
      executionType: "publicity",
      mediaValueLocal: "",
      localCurrency: "USD",
      fxRateUsed: "1",
      fxSource: "",
      fxDate: "",
      notes: "",
      dueDate: "",
      hasClipping: false,
      hasPhotos: false,
      hasLinks: false,
      hasInvoice: false,
      hasContract: false,
    },
  });

  useEffect(() => {
    if (existing && isEdit) {
      form.reset({
        countryId: existing.countryId,
        brandId: existing.brandId,
        titleId: existing.titleId || null,
        studioId: existing.studioId || null,
        executionDate: existing.executionDate || "",
        executionType: existing.executionType as any,
        mediaValueLocal: existing.mediaValueLocal || "",
        localCurrency: existing.localCurrency as any,
        fxRateUsed: existing.fxRateUsed || "1",
        fxSource: existing.fxSource || "",
        fxDate: existing.fxDate || "",
        notes: existing.notes || "",
        dueDate: existing.dueDate || "",
        hasClipping: existing.hasClipping || false,
        hasPhotos: existing.hasPhotos || false,
        hasLinks: existing.hasLinks || false,
        hasInvoice: existing.hasInvoice || false,
        hasContract: existing.hasContract || false,
      });
    }
  }, [existing, isEdit, form]);

  const localCurrency = form.watch("localCurrency");
  const mediaValueLocal = form.watch("mediaValueLocal");
  const fxRate = form.watch("fxRateUsed");

  const computedUsd = (() => {
    const val = parseFloat(mediaValueLocal || "0");
    const rate = parseFloat(fxRate || "1");
    if (localCurrency === "USD") return val;
    if (rate <= 0) return 0;
    return val / rate;
  })();

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const payload = {
        ...data,
        titleId: data.titleId || null,
        studioId: data.studioId || null,
        fxDate: data.fxDate || null,
        dueDate: data.dueDate || null,
        mediaValueUsd: computedUsd.toFixed(2),
        ownerId: user?.id,
        createdBy: user?.id,
        updatedBy: user?.id,
      };
      if (isEdit) {
        await apiRequest("PATCH", `/api/executions/${params.id}`, payload);
      } else {
        await apiRequest("POST", "/api/executions", payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/executions"] });
      toast({ title: isEdit ? t("executionForm.executionUpdated") : t("executionForm.executionCreated") });
      navigate("/executions");
    },
    onError: (e: any) => {
      toast({ title: t("executionForm.error"), description: e.message, variant: "destructive" });
    },
  });

  if (isEdit && loadingExisting) {
    return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/executions")} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold" data-testid="text-form-title">
            {isEdit ? t("executionForm.editExecution") : t("executionForm.newExecution")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("executionForm.fillDetails")}</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("executionForm.basicInformation")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="countryId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.country")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                      <FormControl><SelectTrigger data-testid="select-country"><SelectValue placeholder={t("executionForm.selectCountry")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {countries?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="brandId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.brand")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ? String(field.value) : ""}>
                      <FormControl><SelectTrigger data-testid="select-brand"><SelectValue placeholder={t("executionForm.selectBrand")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {brands?.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="titleId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.title")}</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v ? Number(v) : null)} value={field.value ? String(field.value) : ""}>
                      <FormControl><SelectTrigger data-testid="select-title"><SelectValue placeholder={t("executionForm.selectTitle")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {titlesList?.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="studioId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.studio")}</FormLabel>
                    <Select onValueChange={(v) => field.onChange(v ? Number(v) : null)} value={field.value ? String(field.value) : ""}>
                      <FormControl><SelectTrigger data-testid="select-studio"><SelectValue placeholder={t("executionForm.selectStudio")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {studiosList?.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="executionDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.executionDate")} *</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-execution-date" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="executionType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.executionType")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-execution-type"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {(["canje", "publicity", "third_party"] as const).map((k) => (
                          <SelectItem key={k} value={k}>{typeLabel(k)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="dueDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("executionForm.dueDate")}</FormLabel>
                  <FormControl><Input type="date" {...field} data-testid="input-due-date" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("executionForm.mediaValueCurrency")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField control={form.control} name="localCurrency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.currency")} *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-currency"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {Object.entries(CURRENCY_SYMBOLS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{k} ({v})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="mediaValueLocal" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.localValue")} *</FormLabel>
                    <FormControl><Input type="number" step="0.01" {...field} data-testid="input-media-value" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="fxRateUsed" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.fxRate")} {localCurrency !== "USD" ? "*" : ""}</FormLabel>
                    <FormControl><Input type="number" step="0.000001" {...field} disabled={localCurrency === "USD"} data-testid="input-fx-rate" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <div className="p-3 rounded-md bg-muted flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("executionForm.computedUsdValue")}</span>
                <span className="text-lg font-bold" data-testid="text-computed-usd">
                  ${computedUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="fxSource" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.fxSource")}</FormLabel>
                    <FormControl><Input {...field} placeholder="e.g. Central Bank" data-testid="input-fx-source" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="fxDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("executionForm.fxDate")}</FormLabel>
                    <FormControl><Input type="date" {...field} data-testid="input-fx-date" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <h2 className="text-sm font-semibold">{t("executionForm.checklistNotes")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-4">
                {(["hasClipping", "hasPhotos", "hasLinks", "hasInvoice", "hasContract"] as const).map(field => (
                  <FormField key={field} control={form.control} name={field} render={({ field: f }) => (
                    <FormItem className="flex items-center gap-2">
                      <FormControl>
                        <Checkbox checked={f.value || false} onCheckedChange={f.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0 text-sm">
                        {checklistLabels[field]}
                      </FormLabel>
                    </FormItem>
                  )} />
                ))}
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("executionForm.notes")}</FormLabel>
                  <FormControl><Textarea {...field} rows={3} data-testid="textarea-notes" /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate("/executions")} data-testid="button-cancel">
              {t("executionForm.cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending} data-testid="button-save">
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Save className="w-4 h-4 mr-1" />
              {isEdit ? t("executionForm.update") : t("executionForm.create")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
