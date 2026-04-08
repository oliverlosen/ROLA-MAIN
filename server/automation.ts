import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { notificationCenter } from "./notification-center";
import {
  assets,
  automationAlerts,
  crmCampaigns,
  emailLinks,
  emailThreads,
  executions,
  tasks,
  type AutomationAlert,
  type AutomationAlertWithContext,
  type CampaignGanttExecutionItem,
  type CampaignGanttItem,
  type CampaignWithDetails,
  type ExecutionGanttItem,
  type ExecutionPortfolioGanttItem,
  type ExecutionPortfolioGanttResponse,
  type ExecutionWithDetails,
  type GanttTaskBar,
  type OperationalRiskSummary,
  type Task,
  type TaskWithAssignee,
} from "@shared/schema";

const TASK_DUE_SOON_WINDOW_MS = 48 * 60 * 60 * 1000;
const EXECUTION_DUE_SOON_WINDOW_MS = 72 * 60 * 60 * 1000;
const EMAIL_PENDING_REPLY_WINDOW_MS = 48 * 60 * 60 * 1000;
const ALERT_RENOTIFY_WINDOW_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

type EvaluationOptions = {
  forceNotify?: boolean;
  cascadeExecution?: boolean;
  cascadeCampaign?: boolean;
};

type AlertStateInput = {
  active: boolean;
  dedupeKey: string;
  ruleCode: string;
  entityType: string;
  entityId: number;
  executionId?: number | null;
  taskId?: number | null;
  campaignId?: number | null;
  severity: "low" | "medium" | "high";
  title: string;
  description?: string | null;
  suggestedAction?: string | null;
  payload?: unknown;
  recipientIds?: number[];
  forceNotify?: boolean;
};

type DateRange = {
  start: string | null;
  end: string | null;
  isDerived: boolean;
};

function parseDateStart(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00`);
}

function parseDateEnd(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T23:59:59.999`);
}

function clampProgress(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sortUniqueNumbers(values: Array<number | null | undefined>): number[] {
  return Array.from(new Set(values.filter((value): value is number => typeof value === "number" && Number.isFinite(value))));
}

function pickMinDate(values: Array<string | null | undefined>): string | null {
  const filtered = values.filter((value): value is string => Boolean(value)).sort();
  return filtered[0] || null;
}

function pickMaxDate(values: Array<string | null | undefined>): string | null {
  const filtered = values.filter((value): value is string => Boolean(value)).sort();
  return filtered.length ? filtered[filtered.length - 1] : null;
}

function normalizeRange(start: string | null, end: string | null): DateRange {
  if (start && end && start > end) {
    return { start: end, end: end, isDerived: true };
  }
  if (start && !end) {
    return { start, end: start, isDerived: true };
  }
  if (!start && end) {
    return { start: end, end, isDerived: true };
  }
  return { start, end, isDerived: false };
}

function getTaskProgress(task: Task | TaskWithAssignee): { progress: number; isDerived: boolean } {
  if (typeof task.progressOverride === "number") {
    return { progress: clampProgress(task.progressOverride), isDerived: false };
  }

  const byStatus: Record<string, number> = {
    pending: 0,
    in_progress: 50,
    completed: 100,
    cancelled: 0,
  };

  return { progress: byStatus[task.status] ?? 0, isDerived: true };
}

function getExecutionFallbackProgress(status: string): number {
  const byStatus: Record<string, number> = {
    draft: 0,
    in_review: 25,
    approved: 50,
    executed: 75,
    evidence_uploaded: 90,
    closed: 100,
  };
  return byStatus[status] ?? 0;
}

function getSeverityRank(severity: string): number {
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  return 1;
}

function isTaskActionable(task: Task | TaskWithAssignee): boolean {
  return task.status === "pending" || task.status === "in_progress";
}

function isExecutionOpen(execution: ExecutionWithDetails): boolean {
  return execution.status !== "closed";
}

function compareNullableDatesAsc(a: string | null | undefined, b: string | null | undefined): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

function buildExecutionName(execution: ExecutionWithDetails | null | undefined): string {
  return [execution?.brand?.name, execution?.title?.name].filter(Boolean).join(" - ") || `Execution #${execution?.id ?? ""}`.trim();
}

function buildTaskRange(task: TaskWithAssignee, execution: ExecutionWithDetails): DateRange {
  const explicitStart = task.startDate || null;
  const explicitEnd = task.endDate || task.dueDate || null;

  let start = explicitStart;
  let end = explicitEnd;
  let isDerived = false;

  if (!start && end) {
    start = execution.plannedStartDate || execution.executionDate || end;
    isDerived = true;
  }

  if (start && !end) {
    end = execution.plannedEndDate || execution.dueDate || start;
    isDerived = true;
  }

  if (!start && !end) {
    start = execution.plannedStartDate || execution.executionDate || null;
    end = execution.plannedEndDate || execution.dueDate || execution.executionDate || start;
    isDerived = true;
  }

  const normalized = normalizeRange(start, end);
  return {
    start: normalized.start,
    end: normalized.end,
    isDerived: normalized.isDerived || isDerived,
  };
}

async function buildExecutionGanttInternal(execution: ExecutionWithDetails): Promise<ExecutionGanttItem> {
  const taskRows = await storage.getTasks(execution.id);
  const taskBars: GanttTaskBar[] = taskRows.map((task) => {
    const range = buildTaskRange(task, execution);
    const progressInfo = getTaskProgress(task);
    return {
      ...task,
      rangeStart: range.start,
      rangeEnd: range.end,
      progress: progressInfo.progress,
      isDerivedSchedule: range.isDerived,
      isDerivedProgress: progressInfo.isDerived,
    };
  });

  const progressSource = taskBars.filter((task) => task.status !== "cancelled");
  const derivedProgress = progressSource.length
    ? clampProgress(progressSource.reduce((sum, task) => sum + task.progress, 0) / progressSource.length)
    : getExecutionFallbackProgress(execution.status);
  const progress = typeof execution.progressOverride === "number"
    ? clampProgress(execution.progressOverride)
    : derivedProgress;

  let rangeStart = execution.plannedStartDate || null;
  let rangeEnd = execution.plannedEndDate || execution.dueDate || null;

  let isDerivedRange = false;
  if (!rangeStart || !rangeEnd) {
    rangeStart = rangeStart || pickMinDate(taskBars.map((task) => task.rangeStart)) || execution.executionDate || null;
    rangeEnd = rangeEnd || pickMaxDate(taskBars.map((task) => task.rangeEnd)) || execution.dueDate || execution.executionDate || rangeStart;
    isDerivedRange = true;
  }

  const normalizedRange = normalizeRange(rangeStart, rangeEnd);

  return {
    execution,
    progress,
    rangeStart: normalizedRange.start,
    rangeEnd: normalizedRange.end,
    tasks: taskBars,
    activeTaskCount: progressSource.length,
    completedTaskCount: progressSource.filter((task) => task.status === "completed").length,
  };
}

class AutomationService {
  private schedulerStarted = false;
  private sweepInFlight = false;

  startScheduler() {
    if (this.schedulerStarted) return;
    this.schedulerStarted = true;

    setTimeout(() => {
      void this.runSweep();
    }, 5_000);

    setInterval(() => {
      void this.runSweep();
    }, SWEEP_INTERVAL_MS);
  }

  async runSweep(options: { forceNotify?: boolean } = {}) {
    if (this.sweepInFlight) {
      return { skipped: true };
    }

    this.sweepInFlight = true;

    try {
      const [executionRows, taskRows, campaignRows] = await Promise.all([
        db.select({ id: executions.id }).from(executions),
        db.select({ id: tasks.id }).from(tasks),
        db.select({ id: crmCampaigns.id }).from(crmCampaigns),
      ]);

      for (const row of taskRows) {
        await this.evaluateTask(row.id, {
          forceNotify: options.forceNotify,
          cascadeExecution: false,
        });
      }

      for (const row of executionRows) {
        await this.evaluateExecution(row.id, {
          forceNotify: options.forceNotify,
          cascadeCampaign: false,
        });
      }

      for (const row of campaignRows) {
        await this.evaluateCampaign(row.id, {
          forceNotify: options.forceNotify,
        });
      }

      await this.refreshEmailPendingReplyAlerts({
        forceNotify: options.forceNotify,
      });

      return {
        skipped: false,
        processedExecutions: executionRows.length,
        processedTasks: taskRows.length,
        processedCampaigns: campaignRows.length,
      };
    } finally {
      this.sweepInFlight = false;
    }
  }

  async evaluateTask(taskId: number, options: EvaluationOptions = {}) {
    const task = await storage.getTask(taskId);
    if (!task) return;

    const execution = await storage.getExecution(task.executionId);
    if (!execution) return;

    const recipients = await notificationCenter.getTaskRelatedUserIds(task.id);
    const dueAt = parseDateEnd(task.dueDate);
    const now = Date.now();
    const actionable = isTaskActionable(task);

    const dueSoon = Boolean(
      actionable &&
      dueAt &&
      dueAt.getTime() >= now &&
      dueAt.getTime() - now <= TASK_DUE_SOON_WINDOW_MS,
    );

    const overdue = Boolean(actionable && dueAt && dueAt.getTime() < now);

    await this.setAlertState({
      active: dueSoon,
      dedupeKey: `task_due_soon:task:${task.id}`,
      ruleCode: "task_due_soon",
      entityType: "task",
      entityId: task.id,
      executionId: execution.id,
      taskId: task.id,
      campaignId: execution.campaignId,
      severity: "medium",
      title: `Task due soon: ${task.title}`,
      description: task.dueDate ? `This task is due on ${task.dueDate}.` : "This task is approaching its due date.",
      suggestedAction: "Review the task owner and confirm the next step before it becomes overdue.",
      payload: {
        taskTitle: task.title,
        dueDate: task.dueDate,
        executionName: buildExecutionName(execution),
      },
      recipientIds: recipients,
      forceNotify: options.forceNotify,
    });

    await this.setAlertState({
      active: overdue,
      dedupeKey: `task_overdue:task:${task.id}`,
      ruleCode: "task_overdue",
      entityType: "task",
      entityId: task.id,
      executionId: execution.id,
      taskId: task.id,
      campaignId: execution.campaignId,
      severity: "high",
      title: `Overdue task: ${task.title}`,
      description: task.dueDate ? `This task passed its due date on ${task.dueDate}.` : "This task is overdue.",
      suggestedAction: "Reassign, update the due date, or close the task to clear the risk.",
      payload: {
        taskTitle: task.title,
        dueDate: task.dueDate,
        executionName: buildExecutionName(execution),
      },
      recipientIds: recipients,
      forceNotify: options.forceNotify,
    });

    if (options.cascadeExecution !== false) {
      await this.evaluateExecution(task.executionId, {
        forceNotify: options.forceNotify,
      });
    }
  }

  async evaluateExecution(executionId: number, options: EvaluationOptions = {}) {
    const execution = await storage.getExecution(executionId);
    if (!execution) return;

    const [taskRows, assetRows] = await Promise.all([
      storage.getTasks(executionId),
      storage.getAssets(executionId),
    ]);

    const recipients = await notificationCenter.getExecutionRelatedUserIds(execution.id);
    const now = Date.now();
    const targetDate = execution.dueDate || execution.plannedEndDate;
    const dueAt = parseDateEnd(targetDate);
    const openExecution = isExecutionOpen(execution);
    const activeTasks = taskRows.filter((task) => task.status !== "cancelled");

    const dueSoon = Boolean(
      openExecution &&
      dueAt &&
      dueAt.getTime() >= now &&
      dueAt.getTime() - now <= EXECUTION_DUE_SOON_WINDOW_MS,
    );

    const overdue = Boolean(openExecution && dueAt && dueAt.getTime() < now);
    const missingPlan = Boolean(openExecution && targetDate && activeTasks.length === 0);

    const missingChecklistItems = [
      !execution.hasClipping ? "clipping" : null,
      !execution.hasPhotos ? "photos" : null,
      !execution.hasLinks ? "links" : null,
      !execution.hasInvoice ? "invoice" : null,
      !execution.hasContract ? "contract" : null,
    ].filter((item): item is string => Boolean(item));

    const prereqRisk = Boolean(
      openExecution &&
      dueAt &&
      dueAt.getTime() - now <= EXECUTION_DUE_SOON_WINDOW_MS &&
      (missingChecklistItems.length > 0 || assetRows.length === 0),
    );

    const executionName = buildExecutionName(execution);

    await this.setAlertState({
      active: dueSoon,
      dedupeKey: `execution_due_soon:execution:${execution.id}`,
      ruleCode: "execution_due_soon",
      entityType: "execution",
      entityId: execution.id,
      executionId: execution.id,
      campaignId: execution.campaignId,
      severity: "medium",
      title: `Execution due soon: ${executionName}`,
      description: targetDate ? `This execution is due on ${targetDate}.` : "This execution is approaching its target date.",
      suggestedAction: "Review the plan, owners, and blocking items before the due date passes.",
      payload: {
        executionName,
        dueDate: targetDate,
      },
      recipientIds: recipients,
      forceNotify: options.forceNotify,
    });

    await this.setAlertState({
      active: overdue,
      dedupeKey: `execution_overdue:execution:${execution.id}`,
      ruleCode: "execution_overdue",
      entityType: "execution",
      entityId: execution.id,
      executionId: execution.id,
      campaignId: execution.campaignId,
      severity: "high",
      title: `Overdue execution: ${executionName}`,
      description: targetDate ? `This execution passed its due date on ${targetDate}.` : "This execution is overdue.",
      suggestedAction: "Update the execution plan or close the execution if the work is done.",
      payload: {
        executionName,
        dueDate: targetDate,
      },
      recipientIds: recipients,
      forceNotify: options.forceNotify,
    });

    await this.setAlertState({
      active: missingPlan,
      dedupeKey: `execution_missing_plan:execution:${execution.id}`,
      ruleCode: "execution_missing_plan",
      entityType: "execution",
      entityId: execution.id,
      executionId: execution.id,
      campaignId: execution.campaignId,
      severity: "medium",
      title: `Execution without plan: ${executionName}`,
      description: "This execution has a target date but no active tasks.",
      suggestedAction: "Create the working plan and assign at least one active task.",
      payload: {
        executionName,
        dueDate: targetDate,
      },
      recipientIds: recipients,
      forceNotify: options.forceNotify,
    });

    await this.setAlertState({
      active: prereqRisk,
      dedupeKey: `execution_prereq_risk:execution:${execution.id}`,
      ruleCode: "execution_prereq_risk",
      entityType: "execution",
      entityId: execution.id,
      executionId: execution.id,
      campaignId: execution.campaignId,
      severity: overdue ? "high" : "medium",
      title: `Execution risk: ${executionName}`,
      description: [
        assetRows.length === 0 ? "No assets uploaded yet." : null,
        missingChecklistItems.length
          ? `Missing checklist items: ${missingChecklistItems.join(", ")}.`
          : null,
      ].filter(Boolean).join(" "),
      suggestedAction: "Resolve the missing prerequisites before moving the execution forward.",
      payload: {
        executionName,
        missingChecklistItems,
        assetCount: assetRows.length,
      },
      recipientIds: recipients,
      forceNotify: options.forceNotify,
    });

    await this.evaluateExecutionEmailAlerts(execution, options);

    if (execution.campaignId && options.cascadeCampaign !== false) {
      await this.evaluateCampaign(execution.campaignId, {
        forceNotify: options.forceNotify,
      });
    }
  }

  async evaluateCampaign(campaignId: number, options: EvaluationOptions = {}) {
    const [campaign] = await db.select().from(crmCampaigns).where(eq(crmCampaigns.id, campaignId));
    if (!campaign) return;

    const linkedExecutions = await storage.getExecutionsForCampaign(campaignId);
    const recipientIds = await notificationCenter.getCampaignRelatedUserIds(campaign.id);

    const executionGanttItems = await Promise.all(linkedExecutions.map((execution) => buildExecutionGanttInternal(execution)));
    const outOfWindow = executionGanttItems.filter((item) => {
      const startsBefore = campaign.startDate && item.rangeStart && item.rangeStart < campaign.startDate;
      const endsAfter = campaign.endDate && item.rangeEnd && item.rangeEnd > campaign.endDate;
      return Boolean(startsBefore || endsAfter);
    });

    await this.setAlertState({
      active: Boolean((campaign.startDate || campaign.endDate) && outOfWindow.length > 0),
      dedupeKey: `campaign_date_drift:campaign:${campaign.id}`,
      ruleCode: "campaign_date_drift",
      entityType: "campaign",
      entityId: campaign.id,
      campaignId: campaign.id,
      severity: outOfWindow.length > 1 ? "high" : "medium",
      title: `Campaign date drift: ${campaign.name}`,
      description: outOfWindow.length
        ? `Executions outside the campaign window: ${outOfWindow.map((item) => buildExecutionName(item.execution)).slice(0, 3).join(", ")}${outOfWindow.length > 3 ? "..." : ""}`
        : "Linked executions are aligned with the campaign schedule.",
      suggestedAction: "Adjust the campaign dates or reschedule the linked executions.",
      payload: {
        campaignName: campaign.name,
        executionIds: outOfWindow.map((item) => item.execution.id),
      },
      recipientIds,
      forceNotify: options.forceNotify,
    });
  }

  async evaluateThread(threadId: number, options: EvaluationOptions = {}) {
    const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
    if (!thread) return;

    const links = await db.select().from(emailLinks).where(eq(emailLinks.threadId, threadId));
    const now = Date.now();
    const pendingReply = Boolean(
      thread.lastOutboundAt &&
      thread.lastOutboundAt.getTime() <= now - EMAIL_PENDING_REPLY_WINDOW_MS &&
      (!thread.lastInboundAt || thread.lastInboundAt.getTime() < thread.lastOutboundAt.getTime()),
    );

    for (const link of links) {
      const execution = await storage.getExecution(link.executionId);
      if (!execution) continue;

      const task = link.taskId ? await storage.getTask(link.taskId) : null;
      const recipientIds = task
        ? await notificationCenter.getTaskRelatedUserIds(task.id)
        : await notificationCenter.getExecutionRelatedUserIds(execution.id);

      const subject = thread.subject || "No subject";
      await this.setAlertState({
        active: pendingReply,
        dedupeKey: `email_pending_reply:thread:${thread.id}:execution:${link.executionId}:task:${link.taskId ?? "none"}`,
        ruleCode: "email_pending_reply",
        entityType: task ? "task" : "execution",
        entityId: task?.id || execution.id,
        executionId: execution.id,
        taskId: task?.id || null,
        campaignId: execution.campaignId,
        severity: "medium",
        title: `Pending reply: ${subject}`,
        description: "The latest linked email was sent more than 48 hours ago and still has no reply.",
        suggestedAction: "Open the linked thread and follow up with the external contact.",
        payload: {
          threadId: thread.id,
          subject,
          taskTitle: task?.title || null,
          executionName: buildExecutionName(execution),
        },
        recipientIds,
        forceNotify: options.forceNotify,
      });
    }
  }

  async refreshEmailPendingReplyAlerts(options: EvaluationOptions = {}) {
    const linkRows = await db.select({ threadId: emailLinks.threadId }).from(emailLinks);
    const threadIds = sortUniqueNumbers(linkRows.map((row) => row.threadId));
    for (const threadId of threadIds) {
      await this.evaluateThread(threadId, options);
    }
  }

  async listAlertsForExecution(executionId: number): Promise<AutomationAlertWithContext[]> {
    const rows = await db.select()
      .from(automationAlerts)
      .where(eq(automationAlerts.executionId, executionId))
      .orderBy(desc(automationAlerts.lastTriggeredAt), desc(automationAlerts.createdAt));
    return this.enrichAlerts(rows);
  }

  async listAlertsForCampaign(campaignId: number): Promise<AutomationAlertWithContext[]> {
    const rows = await db.select()
      .from(automationAlerts)
      .where(eq(automationAlerts.campaignId, campaignId))
      .orderBy(desc(automationAlerts.lastTriggeredAt), desc(automationAlerts.createdAt));
    return this.enrichAlerts(rows);
  }

  async getExecutionGantt(executionId: number): Promise<ExecutionGanttItem | undefined> {
    const execution = await storage.getExecution(executionId);
    if (!execution) return undefined;
    return buildExecutionGanttInternal(execution);
  }

  async getExecutionPortfolioGantt(filters: any): Promise<ExecutionPortfolioGanttResponse> {
    const { executions: executionRows } = await storage.getExecutions({
      ...filters,
      page: 1,
      limit: 100000,
    });

    if (!executionRows.length) {
      return {
        summary: {
          executionCount: 0,
          openExecutionCount: 0,
          avgProgress: 0,
          atRiskCount: 0,
          openAlertCount: 0,
          rangeStart: null,
          rangeEnd: null,
        },
        executions: [],
      };
    }

    const executionIds = executionRows.map((execution) => execution.id);
    const [taskRows, openAlertRows] = await Promise.all([
      db.select().from(tasks).where(inArray(tasks.executionId, executionIds)),
      db.select().from(automationAlerts).where(and(inArray(automationAlerts.executionId, executionIds), eq(automationAlerts.status, "open"))),
    ]);

    const tasksByExecution = new Map<number, Task[]>();
    for (const task of taskRows) {
      const current = tasksByExecution.get(task.executionId) || [];
      current.push(task);
      tasksByExecution.set(task.executionId, current);
    }

    const alertsByExecution = new Map<number, AutomationAlert[]>();
    for (const alert of openAlertRows) {
      if (!alert.executionId) continue;
      const current = alertsByExecution.get(alert.executionId) || [];
      current.push(alert);
      alertsByExecution.set(alert.executionId, current);
    }

    const items: ExecutionPortfolioGanttItem[] = executionRows.map((execution) => {
      const executionTasks = tasksByExecution.get(execution.id) || [];
      const taskBars = executionTasks.map((task) => {
        const range = buildTaskRange(task, execution);
        const progressInfo = getTaskProgress(task);
        return {
          ...task,
          rangeStart: range.start,
          rangeEnd: range.end,
          progress: progressInfo.progress,
        };
      });

      const activeTasks = taskBars.filter((task) => task.status !== "cancelled");
      const completedTaskCount = activeTasks.filter((task) => task.status === "completed").length;
      const derivedProgress = activeTasks.length
        ? clampProgress(activeTasks.reduce((sum, task) => sum + task.progress, 0) / activeTasks.length)
        : getExecutionFallbackProgress(execution.status);
      const progress = typeof execution.progressOverride === "number"
        ? clampProgress(execution.progressOverride)
        : derivedProgress;

      let rangeStart = execution.plannedStartDate || null;
      let rangeEnd = execution.plannedEndDate || execution.dueDate || null;
      if (!rangeStart || !rangeEnd) {
        rangeStart = rangeStart || pickMinDate(taskBars.map((task) => task.rangeStart)) || execution.executionDate || null;
        rangeEnd = rangeEnd || pickMaxDate(taskBars.map((task) => task.rangeEnd)) || execution.dueDate || execution.executionDate || rangeStart;
      }

      const normalizedRange = normalizeRange(rangeStart, rangeEnd);
      const executionAlerts = alertsByExecution.get(execution.id) || [];

      return {
        ...execution,
        rangeStart: normalizedRange.start,
        rangeEnd: normalizedRange.end,
        progress,
        openAlertCount: executionAlerts.length,
        atRisk: executionAlerts.some((alert) => alert.severity === "high"),
        activeTaskCount: activeTasks.length,
        completedTaskCount,
        accountName: execution.account?.name || null,
        campaignName: execution.campaign?.name || null,
      };
    });

    items.sort((a, b) =>
      compareNullableDatesAsc(a.rangeStart, b.rangeStart)
      || compareNullableDatesAsc(a.rangeEnd, b.rangeEnd)
      || a.id - b.id);

    const summary = {
      executionCount: items.length,
      openExecutionCount: items.filter((execution) => isExecutionOpen(execution)).length,
      avgProgress: items.length ? clampProgress(items.reduce((sum, execution) => sum + execution.progress, 0) / items.length) : 0,
      atRiskCount: items.filter((execution) => execution.atRisk).length,
      openAlertCount: items.reduce((sum, execution) => sum + execution.openAlertCount, 0),
      rangeStart: pickMinDate(items.map((execution) => execution.rangeStart)),
      rangeEnd: pickMaxDate(items.map((execution) => execution.rangeEnd)),
    };

    return {
      summary,
      executions: items,
    };
  }

  async getCampaignDetails(campaignId: number): Promise<CampaignWithDetails | undefined> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) return undefined;

    const gantt = await this.getCampaignGantt(campaignId);
    return {
      ...campaign,
      progress: gantt?.progress || 0,
      openAlertCount: gantt?.alerts.filter((alert) => alert.status === "open").length || 0,
    };
  }

  async getCampaignGantt(campaignId: number): Promise<CampaignGanttItem | undefined> {
    const campaign = await storage.getCampaign(campaignId);
    if (!campaign) return undefined;

    const executionItems = await Promise.all(
      (campaign.executions || []).map(async (execution) => {
        const gantt = await buildExecutionGanttInternal(execution);
        const alerts = await this.listAlertsForExecution(execution.id);
        const openAlertCount = alerts.filter((alert) => alert.status === "open").length;

        return {
          ...execution,
          rangeStart: gantt.rangeStart,
          rangeEnd: gantt.rangeEnd,
          progress: gantt.progress,
          openAlertCount,
          atRisk: alerts.some((alert) => alert.status === "open" && alert.severity === "high"),
        } satisfies CampaignGanttExecutionItem;
      }),
    );

    const progress = typeof campaign.progressOverride === "number"
      ? clampProgress(campaign.progressOverride)
      : executionItems.length
        ? clampProgress(executionItems.reduce((sum, execution) => sum + execution.progress, 0) / executionItems.length)
        : 0;

    const rangeStart = campaign.startDate || pickMinDate(executionItems.map((execution) => execution.rangeStart));
    const rangeEnd = campaign.endDate || pickMaxDate(executionItems.map((execution) => execution.rangeEnd));
    const normalizedRange = normalizeRange(rangeStart || null, rangeEnd || null);
    const alerts = await this.listAlertsForCampaign(campaignId);

    return {
      campaign: {
        ...campaign,
        progress,
        openAlertCount: alerts.filter((alert) => alert.status === "open").length,
      },
      progress,
      rangeStart: normalizedRange.start,
      rangeEnd: normalizedRange.end,
      executions: executionItems,
      alerts,
    };
  }

  async getOperationalRiskSummary(): Promise<OperationalRiskSummary> {
    const rows = await db.select()
      .from(automationAlerts)
      .where(eq(automationAlerts.status, "open"))
      .orderBy(desc(automationAlerts.lastTriggeredAt));

    const enriched = await this.enrichAlerts(rows);
    const alertsByRuleMap = new Map<string, number>();
    for (const row of rows) {
      alertsByRuleMap.set(row.ruleCode, (alertsByRuleMap.get(row.ruleCode) || 0) + 1);
    }

    return {
      openAlertCount: rows.length,
      highSeverityCount: rows.filter((row) => row.severity === "high").length,
      overdueTaskCount: rows.filter((row) => row.ruleCode === "task_overdue").length,
      overdueExecutionCount: rows.filter((row) => row.ruleCode === "execution_overdue").length,
      pendingReplyCount: rows.filter((row) => row.ruleCode === "email_pending_reply").length,
      alertsByRule: Array.from(alertsByRuleMap.entries()).map(([ruleCode, count]) => ({ ruleCode, count })),
      topAlerts: enriched
        .sort((a, b) => {
          const severityDelta = getSeverityRank(b.severity) - getSeverityRank(a.severity);
          if (severityDelta !== 0) return severityDelta;
          const aTime = a.lastTriggeredAt ? new Date(a.lastTriggeredAt).getTime() : 0;
          const bTime = b.lastTriggeredAt ? new Date(b.lastTriggeredAt).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 8),
    };
  }

  private async setAlertState(input: AlertStateInput) {
    const existing = await db.select()
      .from(automationAlerts)
      .where(eq(automationAlerts.dedupeKey, input.dedupeKey))
      .then((rows) => rows[0]);

    const now = new Date();

    if (!input.active) {
      if (existing && existing.status === "open") {
        await db.update(automationAlerts)
          .set({
            status: "resolved",
            resolvedAt: now,
            updatedAt: now,
            title: input.title,
            description: input.description || null,
            suggestedAction: input.suggestedAction || null,
            payload: input.payload ?? null,
          })
          .where(eq(automationAlerts.id, existing.id));
      }
      return;
    }

    let alert: AutomationAlert;
    let shouldNotify = false;

    if (existing) {
      const reopened = existing.status === "resolved";
      const [updated] = await db.update(automationAlerts)
        .set({
          ruleCode: input.ruleCode,
          entityType: input.entityType,
          entityId: input.entityId,
          executionId: input.executionId ?? null,
          taskId: input.taskId ?? null,
          campaignId: input.campaignId ?? null,
          severity: input.severity,
          title: input.title,
          description: input.description || null,
          suggestedAction: input.suggestedAction || null,
          status: "open",
          resolvedAt: null,
          lastTriggeredAt: now,
          updatedAt: now,
          payload: input.payload ?? null,
        })
        .where(eq(automationAlerts.id, existing.id))
        .returning();

      alert = updated;
      shouldNotify = Boolean(
        input.forceNotify ||
        reopened ||
        !existing.lastNotifiedAt ||
        now.getTime() - existing.lastNotifiedAt.getTime() >= ALERT_RENOTIFY_WINDOW_MS,
      );
    } else {
      const [created] = await db.insert(automationAlerts)
        .values({
          ruleCode: input.ruleCode,
          entityType: input.entityType,
          entityId: input.entityId,
          executionId: input.executionId ?? null,
          taskId: input.taskId ?? null,
          campaignId: input.campaignId ?? null,
          severity: input.severity,
          title: input.title,
          description: input.description || null,
          suggestedAction: input.suggestedAction || null,
          status: "open",
          dedupeKey: input.dedupeKey,
          payload: input.payload ?? null,
          firstTriggeredAt: now,
          lastTriggeredAt: now,
          updatedAt: now,
        })
        .returning();

      alert = created;
      shouldNotify = true;
    }

    if (shouldNotify) {
      await this.notifyAlert(alert, input.recipientIds || []);
      await db.update(automationAlerts)
        .set({ lastNotifiedAt: now, updatedAt: now })
        .where(eq(automationAlerts.id, alert.id));
    }
  }

  private async notifyAlert(alert: AutomationAlert, recipientIds: number[]) {
    const uniqueRecipientIds = sortUniqueNumbers(recipientIds);
    if (!uniqueRecipientIds.length) return;

    await notificationCenter.sendNotification({
      recipientIds: uniqueRecipientIds,
      actorId: null,
      executionId: alert.executionId ?? null,
      entityType: "automation_alert",
      entityId: alert.id,
      type: "automation_alert",
      payload: {
        ...((alert.payload && typeof alert.payload === "object") ? alert.payload as Record<string, unknown> : {}),
        alertId: alert.id,
        title: alert.title,
        severity: alert.severity,
        ruleCode: alert.ruleCode,
        suggestedAction: alert.suggestedAction,
        executionId: alert.executionId,
        taskId: alert.taskId,
        campaignId: alert.campaignId,
      },
    });
  }

  private async enrichAlerts(rows: AutomationAlert[]): Promise<AutomationAlertWithContext[]> {
    const executionIds = sortUniqueNumbers(rows.map((row) => row.executionId));
    const taskIds = sortUniqueNumbers(rows.map((row) => row.taskId));
    const campaignIds = sortUniqueNumbers(rows.map((row) => row.campaignId));

    const [executionEntries, taskEntries, campaignEntries] = await Promise.all([
      Promise.all(executionIds.map(async (id) => [id, await storage.getExecution(id)] as const)),
      Promise.all(taskIds.map(async (id) => [id, await storage.getTask(id)] as const)),
      Promise.all(campaignIds.map(async (id) => [id, await storage.getCampaign(id)] as const)),
    ]);

    const executionMap = new Map<number, ExecutionWithDetails | undefined>(executionEntries);
    const taskMap = new Map<number, TaskWithAssignee | undefined>(taskEntries);
    const campaignMap = new Map<number, CampaignWithDetails | undefined>(campaignEntries);

    return rows
      .map((row) => ({
        ...row,
        execution: row.executionId
          ? (() => {
              const execution = executionMap.get(row.executionId);
              if (!execution) return null;
              return {
                id: execution.id,
                status: execution.status,
                dueDate: execution.dueDate,
                brandName: execution.brand?.name || null,
                titleName: execution.title?.name || null,
              };
            })()
          : null,
        task: row.taskId
          ? (() => {
              const task = taskMap.get(row.taskId);
              if (!task) return null;
              return {
                id: task.id,
                title: task.title,
                status: task.status,
                dueDate: task.dueDate,
              };
            })()
          : null,
        campaign: row.campaignId
          ? (() => {
              const campaign = campaignMap.get(row.campaignId);
              if (!campaign) return null;
              return {
                id: campaign.id,
                name: campaign.name,
                status: campaign.status,
                startDate: campaign.startDate,
                endDate: campaign.endDate,
              };
            })()
          : null,
      }))
      .sort((a, b) => {
        if (a.status !== b.status) {
          return a.status === "open" ? -1 : 1;
        }
        const severityDelta = getSeverityRank(b.severity) - getSeverityRank(a.severity);
        if (severityDelta !== 0) return severityDelta;
        const aTime = a.lastTriggeredAt ? new Date(a.lastTriggeredAt).getTime() : 0;
        const bTime = b.lastTriggeredAt ? new Date(b.lastTriggeredAt).getTime() : 0;
        return bTime - aTime;
      });
  }

  private async evaluateExecutionEmailAlerts(execution: ExecutionWithDetails, options: EvaluationOptions) {
    const linkRows = await db.select({ threadId: emailLinks.threadId })
      .from(emailLinks)
      .where(eq(emailLinks.executionId, execution.id));
    const threadIds = sortUniqueNumbers(linkRows.map((row) => row.threadId));
    for (const threadId of threadIds) {
      await this.evaluateThread(threadId, options);
    }
  }
}

export const automationService = new AutomationService();
