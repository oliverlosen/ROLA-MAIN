import crypto from "crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { notificationCenter } from "./notification-center";
import {
  brands,
  emailAccounts,
  emailLinks,
  emailMessages,
  emailRecipients,
  emailSyncCursors,
  emailThreads,
  executions,
  tasks,
  titles,
  users,
  type EmailAccount,
  type EmailAccountSafe,
  type EmailLinkWithContext,
  type EmailMessageWithRecipients,
  type EmailSyncStatus,
  type EmailThreadWithDetails,
  emailProviderValues,
} from "@shared/schema";

type EmailProvider = (typeof emailProviderValues)[number];
type EmailCursorType = "history" | "delta" | "subscription";
type RecipientType = "to" | "cc" | "bcc";
type EmailDirection = "inbound" | "outbound";

type EmailParticipant = {
  email: string;
  name?: string | null;
};

type ProviderCursor = {
  cursorType: EmailCursorType;
  cursorValue?: string | null;
  payload?: unknown;
  expiresAt?: Date | null;
};

type ProviderAccountPatch = {
  webhookId?: string | null;
  webhookResource?: string | null;
  webhookExpiresAt?: Date | null;
  lastError?: string | null;
};

type ProviderConnectionResult = {
  accessToken: string;
  refreshToken?: string | null;
  tokenType?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  emailAddress: string;
  displayName?: string | null;
  providerAccountId?: string | null;
  cursors?: ProviderCursor[];
};

type NormalizedEmailMessage = {
  remoteThreadId: string;
  remoteConversationId?: string | null;
  remoteMessageId: string;
  internetMessageId?: string | null;
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  sender?: EmailParticipant | null;
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  inReplyTo?: string | null;
  references?: string[];
  sentAt?: Date | null;
};

type ProviderSyncResult = {
  messages: NormalizedEmailMessage[];
  cursors?: ProviderCursor[];
  accountPatch?: ProviderAccountPatch;
};

type DecryptedAccount = EmailAccount & {
  accessToken: string | null;
  refreshToken: string | null;
};

type SendPayload = {
  to: EmailParticipant[];
  cc: EmailParticipant[];
  bcc: EmailParticipant[];
  subject: string;
  body: string;
};

interface EmailProviderClient {
  provider: EmailProvider;
  getAuthorizationUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<ProviderConnectionResult>;
  refreshTokens(refreshToken: string, redirectUri: string): Promise<Pick<ProviderConnectionResult, "accessToken" | "refreshToken" | "expiresAt" | "tokenType" | "scopes">>;
  syncMessages(account: DecryptedAccount, cursors: Map<EmailCursorType, { value?: string | null; expiresAt?: Date | null }>, baseUrl: string): Promise<ProviderSyncResult>;
  sendMessage(account: DecryptedAccount, payload: SendPayload): Promise<NormalizedEmailMessage>;
  replyToMessage(
    account: DecryptedAccount,
    sourceMessage: EmailMessageWithRecipients,
    thread: EmailThreadWithDetails,
    body: string,
  ): Promise<NormalizedEmailMessage>;
  parseWebhook(body: any, query: Record<string, unknown>): Promise<{ validationToken?: string; hints: { emailAddress?: string; subscriptionId?: string; historyId?: string }[] }>;
}

type ThreadFilters = {
  executionId?: number;
  taskId?: number;
  search?: string;
};

type EmailProviderStatusReason = "missing_env" | null;

export type EmailProviderStatus = {
  provider: EmailProvider;
  displayName: string;
  enabled: boolean;
  reason: EmailProviderStatusReason;
  callbackUrl: string;
  missingEnv: string[];
  message: string;
};

const providerDisplayNames: Record<EmailProvider, string> = {
  google: "Google Workspace",
  microsoft: "Microsoft 365",
};

const providerRequiredEnv: Record<EmailProvider, string[]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
};

function getTokenSecret(): Buffer {
  const secret = process.env.EMAIL_TOKEN_SECRET || process.env.SESSION_SECRET || "rola-email-secret";
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTokenSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const [ivB64, tagB64, dataB64] = value.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", getTokenSecret(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function textToHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function normalizeEmail(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function parseSingleAddress(value: string | null | undefined): EmailParticipant | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(?:"?([^"]*)"?\s)?<?([^<>@\s]+@[^<>@\s]+)>?$/);
  if (!match) return { email: trimmed };
  return {
    name: match[1]?.trim() || null,
    email: match[2].trim(),
  };
}

function parseAddressList(value: string | null | undefined): EmailParticipant[] {
  if (!value) return [];
  return value
    .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
    .map((part) => parseSingleAddress(part))
    .filter((item): item is EmailParticipant => Boolean(item?.email));
}

function formatAddressHeader(participants: EmailParticipant[]): string | undefined {
  if (!participants.length) return undefined;
  return participants
    .map((participant) => {
      if (participant.name) {
        return `"${participant.name.replace(/"/g, '\\"')}" <${participant.email}>`;
      }
      return participant.email;
    })
    .join(", ");
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string | null | undefined): string {
  if (!input) return "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "="), "base64").toString("utf8");
}

function buildMimeMessage(payload: SendPayload, options?: { inReplyTo?: string | null; references?: string[]; subjectOverride?: string }) {
  const headers = [
    `To: ${formatAddressHeader(payload.to) || ""}`,
    payload.cc.length ? `Cc: ${formatAddressHeader(payload.cc)}` : null,
    payload.bcc.length ? `Bcc: ${formatAddressHeader(payload.bcc)}` : null,
    `Subject: ${options?.subjectOverride || payload.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    options?.inReplyTo ? `In-Reply-To: ${options.inReplyTo}` : null,
    options?.references?.length ? `References: ${options.references.join(" ")}` : null,
  ].filter(Boolean);

  return `${headers.join("\r\n")}\r\n\r\n${payload.body}`;
}

function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function asDate(value: string | number | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function dedupeParticipants(participants: EmailParticipant[]): EmailParticipant[] {
  const seen = new Set<string>();
  const result: EmailParticipant[] = [];
  for (const participant of participants) {
    const email = normalizeEmail(participant.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    result.push({ ...participant, email });
  }
  return result;
}

function makeMsClientState(accountId: number): string {
  const payload = `ms:${accountId}`;
  const signature = crypto
    .createHmac("sha256", getTokenSecret())
    .update(payload)
    .digest("hex");
  return `${payload}:${signature}`;
}

function isValidMsClientState(clientState: string | null | undefined): boolean {
  if (!clientState) return false;
  const [prefix, accountId, signature] = clientState.split(":");
  if (prefix !== "ms" || !accountId || !signature) return false;
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(crypto.createHmac("sha256", getTokenSecret()).update(`ms:${accountId}`).digest("hex")),
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (!text) {
    return null as T;
  }
  return JSON.parse(text) as T;
}

class GoogleEmailProvider implements EmailProviderClient {
  provider: EmailProvider = "google";
  private readonly scope = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
  ];

  getAuthorizationUrl(state: string, redirectUri: string): string {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google email integration is not configured");
    }
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("scope", this.scope.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderConnectionResult> {
    const tokens = await fetchJson<any>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const profile = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : this.scope,
      emailAddress: profile.emailAddress,
      providerAccountId: profile.emailAddress?.toLowerCase(),
      displayName: profile.emailAddress,
      cursors: profile.historyId ? [{ cursorType: "history", cursorValue: String(profile.historyId) }] : [],
    };
  }

  async refreshTokens(refreshToken: string, redirectUri: string) {
    const tokens = await fetchJson<any>("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "refresh_token",
      }),
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
      tokenType: tokens.token_type,
      expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : undefined,
    };
  }

  async syncMessages(account: DecryptedAccount, cursors: Map<EmailCursorType, { value?: string | null; expiresAt?: Date | null }>, _baseUrl: string): Promise<ProviderSyncResult> {
    const accessToken = account.accessToken;
    if (!accessToken) throw new Error("Missing Google access token");

    const messages = new Map<string, NormalizedEmailMessage>();
    let historyId = cursors.get("history")?.value || null;
    let nextHistoryId = historyId;

    try {
      if (historyId) {
        let pageToken: string | undefined;
        do {
          const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
          url.searchParams.set("startHistoryId", historyId);
          url.searchParams.set("historyTypes", "messageAdded");
          url.searchParams.set("maxResults", "100");
          if (pageToken) url.searchParams.set("pageToken", pageToken);
          const history = await fetchJson<any>(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          nextHistoryId = history.historyId ? String(history.historyId) : nextHistoryId;
          for (const entry of ensureArray<any>(history.history)) {
            for (const item of ensureArray<any>(entry.messagesAdded)) {
              const normalized = await this.fetchMessage(account, item.message?.id || item.id);
              if (normalized) {
                messages.set(normalized.remoteMessageId, normalized);
              }
            }
          }
          pageToken = history.nextPageToken;
        } while (pageToken);
      } else {
        const list = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:anywhere%20-in:drafts", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        for (const item of ensureArray<any>(list.messages)) {
          const normalized = await this.fetchMessage(account, item.id);
          if (normalized) {
            messages.set(normalized.remoteMessageId, normalized);
          }
        }
        const profile = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        nextHistoryId = profile.historyId ? String(profile.historyId) : nextHistoryId;
      }
    } catch (error: any) {
      if (String(error.message || "").includes("startHistoryId")) {
        const list = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=in:anywhere%20-in:drafts", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        for (const item of ensureArray<any>(list.messages)) {
          const normalized = await this.fetchMessage(account, item.id);
          if (normalized) {
            messages.set(normalized.remoteMessageId, normalized);
          }
        }
        const profile = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        nextHistoryId = profile.historyId ? String(profile.historyId) : null;
      } else {
        throw error;
      }
    }

    const cursorsToSave: ProviderCursor[] = nextHistoryId
      ? [{ cursorType: "history", cursorValue: nextHistoryId }]
      : [];

    const topicName = process.env.GOOGLE_GMAIL_PUBSUB_TOPIC;
    const subscriptionExpiresAt = cursors.get("subscription")?.expiresAt;
    if (topicName && (!subscriptionExpiresAt || subscriptionExpiresAt.getTime() < Date.now() + 60 * 60 * 1000)) {
      const watch = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ topicName }),
      });
      if (watch.historyId) {
        cursorsToSave.push({ cursorType: "history", cursorValue: String(watch.historyId) });
      }
      cursorsToSave.push({
        cursorType: "subscription",
        cursorValue: topicName,
        expiresAt: watch.expiration ? new Date(Number(watch.expiration)) : null,
      });
    }

    return {
      messages: Array.from(messages.values()),
      cursors: cursorsToSave,
      accountPatch: topicName ? { webhookResource: topicName, webhookExpiresAt: cursorsToSave.find((cursor) => cursor.cursorType === "subscription")?.expiresAt || null } : undefined,
    };
  }

  async sendMessage(account: DecryptedAccount, payload: SendPayload): Promise<NormalizedEmailMessage> {
    const raw = buildMimeMessage(payload);
    const sent = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64UrlEncode(raw) }),
    });
    const normalized = await this.fetchMessage(account, sent.id);
    if (normalized) return normalized;
    return {
      remoteThreadId: sent.threadId || sent.id,
      remoteConversationId: sent.threadId || sent.id,
      remoteMessageId: sent.id,
      subject: payload.subject,
      bodyText: payload.body,
      bodyHtml: textToHtml(payload.body),
      sender: { email: account.emailAddress, name: account.displayName },
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      sentAt: new Date(),
    };
  }

  async replyToMessage(account: DecryptedAccount, sourceMessage: EmailMessageWithRecipients, thread: EmailThreadWithDetails, body: string): Promise<NormalizedEmailMessage> {
    const mime = buildMimeMessage(
      {
        to: sourceMessage.direction === "inbound"
          ? [{ email: sourceMessage.senderEmail || "", name: sourceMessage.senderName || null }]
          : sourceMessage.recipients?.filter((recipient) => recipient.type === "to").map((recipient) => ({ email: recipient.email, name: recipient.name })) || [],
        cc: [],
        bcc: [],
        subject: thread.subject,
        body,
      },
      {
        inReplyTo: sourceMessage.internetMessageId || sourceMessage.inReplyTo || undefined,
        references: [
          ...safeJsonParse<string[]>(sourceMessage.references, []),
          ...(sourceMessage.internetMessageId ? [sourceMessage.internetMessageId] : []),
        ],
        subjectOverride: thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      },
    );
    const sent = await fetchJson<any>("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: base64UrlEncode(mime),
        threadId: thread.providerThreadId,
      }),
    });
    const normalized = await this.fetchMessage(account, sent.id);
    if (normalized) return normalized;
    return {
      remoteThreadId: thread.providerThreadId,
      remoteConversationId: thread.providerConversationId,
      remoteMessageId: sent.id,
      subject: thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
      bodyText: body,
      bodyHtml: textToHtml(body),
      sender: { email: account.emailAddress, name: account.displayName },
      to: [{ email: sourceMessage.senderEmail || "" }],
      cc: [],
      bcc: [],
      sentAt: new Date(),
      inReplyTo: sourceMessage.internetMessageId || null,
    };
  }

  async parseWebhook(body: any, _query: Record<string, unknown>): Promise<{ validationToken?: string; hints: { emailAddress?: string; subscriptionId?: string; historyId?: string }[] }> {
    const payload = body?.message?.data ? JSON.parse(Buffer.from(body.message.data, "base64").toString("utf8")) : null;
    if (!payload?.emailAddress) {
      return { hints: [] };
    }
    return {
      hints: [{ emailAddress: payload.emailAddress, historyId: payload.historyId ? String(payload.historyId) : undefined }],
    };
  }

  private async fetchMessage(account: DecryptedAccount, messageId: string | undefined): Promise<NormalizedEmailMessage | null> {
    if (!messageId) return null;
    const message = await fetchJson<any>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    if (ensureArray(message.labelIds).includes("DRAFT")) return null;

    const headers = new Map<string, string>();
    for (const header of ensureArray<any>(message.payload?.headers)) {
      if (header?.name) headers.set(String(header.name).toLowerCase(), String(header.value || ""));
    }

    const bodies = this.extractBodies(message.payload);
    return {
      remoteThreadId: message.threadId || message.id,
      remoteConversationId: message.threadId || message.id,
      remoteMessageId: message.id,
      internetMessageId: headers.get("message-id") || headers.get("message-id".toLowerCase()) || null,
      subject: headers.get("subject") || message.snippet || "",
      snippet: message.snippet || null,
      bodyText: bodies.text || stripHtml(bodies.html || message.snippet || ""),
      bodyHtml: bodies.html || null,
      sender: parseSingleAddress(headers.get("from")),
      to: parseAddressList(headers.get("to")),
      cc: parseAddressList(headers.get("cc")),
      bcc: parseAddressList(headers.get("bcc")),
      inReplyTo: headers.get("in-reply-to") || null,
      references: (headers.get("references") || "").split(/\s+/).filter(Boolean),
      sentAt: asDate(headers.get("date")) || asDate(message.internalDate),
    };
  }

  private extractBodies(payload: any): { text?: string; html?: string } {
    const result: { text?: string; html?: string } = {};
    const visit = (part: any) => {
      const mimeType = String(part?.mimeType || "").toLowerCase();
      if (mimeType === "text/plain" && part?.body?.data) {
        result.text = base64UrlDecode(part.body.data);
      }
      if (mimeType === "text/html" && part?.body?.data) {
        result.html = base64UrlDecode(part.body.data);
      }
      for (const child of ensureArray(part?.parts)) visit(child);
    };
    visit(payload);
    return result;
  }
}

class MicrosoftEmailProvider implements EmailProviderClient {
  provider: EmailProvider = "microsoft";
  private readonly scope = [
    "offline_access",
    "User.Read",
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
  ];

  getAuthorizationUrl(state: string, redirectUri: string): string {
    if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Microsoft email integration is not configured");
    }
    const url = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    url.searchParams.set("client_id", process.env.MICROSOFT_CLIENT_ID);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", this.scope.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<ProviderConnectionResult> {
    const tokens = await fetchJson<any>("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const profile = await fetchJson<any>("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const emailAddress = profile.mail || profile.userPrincipalName;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenType: tokens.token_type,
      expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : this.scope,
      emailAddress,
      displayName: profile.displayName || emailAddress,
      providerAccountId: profile.id || emailAddress,
    };
  }

  async refreshTokens(refreshToken: string, redirectUri: string) {
    const tokens = await fetchJson<any>("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        redirect_uri: redirectUri,
      }),
    });
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || refreshToken,
      tokenType: tokens.token_type,
      expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
      scopes: typeof tokens.scope === "string" ? tokens.scope.split(" ") : undefined,
    };
  }

  async syncMessages(account: DecryptedAccount, cursors: Map<EmailCursorType, { value?: string | null; expiresAt?: Date | null }>, baseUrl: string): Promise<ProviderSyncResult> {
    const accessToken = account.accessToken;
    if (!accessToken) throw new Error("Missing Microsoft access token");

    const messages: NormalizedEmailMessage[] = [];
    let nextUrl = cursors.get("delta")?.value || "https://graph.microsoft.com/v1.0/me/messages/delta?$select=id,conversationId,internetMessageId,subject,bodyPreview,receivedDateTime,sentDateTime,from,toRecipients,ccRecipients,bccRecipients,body,isDraft&$top=50";
    let loops = 0;
    let finalCursor = nextUrl;

    while (nextUrl && loops < 5) {
      const page = await fetchJson<any>(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      for (const item of ensureArray<any>(page.value)) {
        if (item.isDraft) continue;
        messages.push({
          remoteThreadId: item.conversationId || item.id,
          remoteConversationId: item.conversationId || item.id,
          remoteMessageId: item.id,
          internetMessageId: item.internetMessageId || null,
          subject: item.subject || "",
          snippet: item.bodyPreview || "",
          bodyHtml: item.body?.contentType?.toLowerCase() === "html" ? item.body?.content || "" : null,
          bodyText: item.body?.contentType?.toLowerCase() === "text" ? item.body?.content || "" : stripHtml(item.body?.content || item.bodyPreview || ""),
          sender: item.from?.emailAddress ? { email: item.from.emailAddress.address, name: item.from.emailAddress.name } : null,
          to: ensureArray(item.toRecipients).map((recipient: any) => ({
            email: recipient.emailAddress?.address,
            name: recipient.emailAddress?.name,
          })).filter((recipient: EmailParticipant) => recipient.email),
          cc: ensureArray(item.ccRecipients).map((recipient: any) => ({
            email: recipient.emailAddress?.address,
            name: recipient.emailAddress?.name,
          })).filter((recipient: EmailParticipant) => recipient.email),
          bcc: ensureArray(item.bccRecipients).map((recipient: any) => ({
            email: recipient.emailAddress?.address,
            name: recipient.emailAddress?.name,
          })).filter((recipient: EmailParticipant) => recipient.email),
          sentAt: asDate(item.sentDateTime || item.receivedDateTime),
        });
      }
      nextUrl = page["@odata.nextLink"] || null;
      finalCursor = page["@odata.deltaLink"] || page["@odata.nextLink"] || finalCursor;
      loops += 1;
    }

    const cursorsToSave: ProviderCursor[] = finalCursor
      ? [{ cursorType: "delta", cursorValue: finalCursor }]
      : [];

    let accountPatch: ProviderAccountPatch | undefined;
    const expiresSoon = !account.webhookExpiresAt || account.webhookExpiresAt.getTime() < Date.now() + 6 * 60 * 60 * 1000;
    if (!account.webhookId || expiresSoon) {
      const subscription = await fetchJson<any>("https://graph.microsoft.com/v1.0/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          changeType: "created,updated",
          notificationUrl: `${baseUrl}/api/email/webhooks/microsoft`,
          resource: "me/messages",
          expirationDateTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          clientState: makeMsClientState(account.id),
        }),
      });
      accountPatch = {
        webhookId: subscription.id,
        webhookResource: subscription.resource,
        webhookExpiresAt: asDate(subscription.expirationDateTime),
      };
      cursorsToSave.push({
        cursorType: "subscription",
        cursorValue: subscription.id,
        expiresAt: asDate(subscription.expirationDateTime),
      });
    }

    return { messages, cursors: cursorsToSave, accountPatch };
  }

  async sendMessage(account: DecryptedAccount, payload: SendPayload): Promise<NormalizedEmailMessage> {
    const draft = await fetchJson<any>("https://graph.microsoft.com/v1.0/me/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: payload.subject,
        body: { contentType: "Text", content: payload.body },
        toRecipients: payload.to.map((recipient) => ({
          emailAddress: { address: recipient.email, name: recipient.name || undefined },
        })),
        ccRecipients: payload.cc.map((recipient) => ({
          emailAddress: { address: recipient.email, name: recipient.name || undefined },
        })),
        bccRecipients: payload.bcc.map((recipient) => ({
          emailAddress: { address: recipient.email, name: recipient.name || undefined },
        })),
      }),
    });

    await fetchJson<void>(`https://graph.microsoft.com/v1.0/me/messages/${draft.id}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });

    return {
      remoteThreadId: draft.conversationId || draft.id,
      remoteConversationId: draft.conversationId || draft.id,
      remoteMessageId: draft.id,
      internetMessageId: draft.internetMessageId || null,
      subject: draft.subject || payload.subject,
      snippet: payload.body.slice(0, 140),
      bodyText: payload.body,
      bodyHtml: textToHtml(payload.body),
      sender: { email: account.emailAddress, name: account.displayName },
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      sentAt: new Date(),
    };
  }

  async replyToMessage(account: DecryptedAccount, sourceMessage: EmailMessageWithRecipients, thread: EmailThreadWithDetails, body: string): Promise<NormalizedEmailMessage> {
    const draft = await fetchJson<any>(`https://graph.microsoft.com/v1.0/me/messages/${sourceMessage.providerMessageId}/createReply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    await fetchJson<void>(`https://graph.microsoft.com/v1.0/me/messages/${draft.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${account.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body: {
          contentType: "Text",
          content: body,
        },
      }),
    });
    await fetchJson<void>(`https://graph.microsoft.com/v1.0/me/messages/${draft.id}/send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.accessToken}` },
    });
    return {
      remoteThreadId: draft.conversationId || thread.providerThreadId,
      remoteConversationId: draft.conversationId || thread.providerConversationId,
      remoteMessageId: draft.id,
      internetMessageId: draft.internetMessageId || null,
      subject: draft.subject || (thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`),
      snippet: body.slice(0, 140),
      bodyText: body,
      bodyHtml: textToHtml(body),
      sender: { email: account.emailAddress, name: account.displayName },
      to: sourceMessage.senderEmail ? [{ email: sourceMessage.senderEmail, name: sourceMessage.senderName || null }] : [],
      cc: [],
      bcc: [],
      sentAt: new Date(),
      inReplyTo: sourceMessage.internetMessageId || null,
    };
  }

  async parseWebhook(body: any, query: Record<string, unknown>): Promise<{ validationToken?: string; hints: { emailAddress?: string; subscriptionId?: string; historyId?: string }[] }> {
    const validationToken = typeof query.validationToken === "string" ? query.validationToken : undefined;
    if (validationToken) {
      return { validationToken, hints: [] };
    }
    const hints = ensureArray<any>(body?.value)
      .filter((item) => isValidMsClientState(item.clientState))
      .map((item) => ({ subscriptionId: item.subscriptionId }));
    return { hints };
  }
}

export class EmailService {
  private readonly providers: Record<EmailProvider, EmailProviderClient> = {
    google: new GoogleEmailProvider(),
    microsoft: new MicrosoftEmailProvider(),
  };

  getProviderStatus(provider: EmailProvider, baseUrl: string): EmailProviderStatus {
    const callbackUrl = `${baseUrl}/api/email/accounts/${provider}/callback`;
    const missingEnv = providerRequiredEnv[provider].filter((key) => !process.env[key]);
    const displayName = providerDisplayNames[provider];
    const enabled = missingEnv.length === 0;

    return {
      provider,
      displayName,
      enabled,
      reason: enabled ? null : "missing_env",
      callbackUrl,
      missingEnv,
      message: enabled
        ? `${displayName} OAuth is configured.`
        : `${displayName} is not configured. Missing environment variables: ${missingEnv.join(", ")}`,
    };
  }

  getProviderStatuses(baseUrl: string): Record<EmailProvider, EmailProviderStatus> {
    return {
      google: this.getProviderStatus("google", baseUrl),
      microsoft: this.getProviderStatus("microsoft", baseUrl),
    };
  }

  getAuthorizationUrl(provider: EmailProvider, state: string, baseUrl: string): string {
    return this.providers[provider].getAuthorizationUrl(state, `${baseUrl}/api/email/accounts/${provider}/callback`);
  }

  async completeConnection(userId: number, provider: EmailProvider, code: string, baseUrl: string): Promise<EmailAccountSafe> {
    const client = this.providers[provider];
    const connected = await client.exchangeCode(code, `${baseUrl}/api/email/accounts/${provider}/callback`);

    const existingAccounts = await db.select().from(emailAccounts).where(eq(emailAccounts.userId, userId));
    const matching = existingAccounts.find((account) =>
      account.provider === provider &&
      (
        (connected.providerAccountId && account.providerAccountId === connected.providerAccountId) ||
        normalizeEmail(account.emailAddress) === normalizeEmail(connected.emailAddress)
      ),
    );

    const activeOther = existingAccounts.find((account) =>
      account.status === "connected" &&
      account.disconnectedAt == null &&
      account.id !== matching?.id,
    );
    if (activeOther) {
      throw new Error("Only one active email account is allowed per user");
    }

    const values = {
      userId,
      provider,
      emailAddress: connected.emailAddress,
      displayName: connected.displayName || connected.emailAddress,
      providerAccountId: connected.providerAccountId || connected.emailAddress,
      accessTokenEncrypted: encryptSecret(connected.accessToken),
      refreshTokenEncrypted: encryptSecret(connected.refreshToken),
      tokenType: connected.tokenType || "Bearer",
      scopes: connected.scopes || [],
      expiresAt: connected.expiresAt || null,
      status: "connected" as const,
      lastError: null,
      disconnectedAt: null,
      updatedAt: new Date(),
    };

    let account: EmailAccount;
    if (matching) {
      const [updated] = await db.update(emailAccounts)
        .set(values)
        .where(eq(emailAccounts.id, matching.id))
        .returning();
      account = updated;
    } else {
      const [created] = await db.insert(emailAccounts)
        .values(values)
        .returning();
      account = created;
    }

    for (const cursor of connected.cursors || []) {
      await this.saveCursor(account.id, cursor);
    }

    try {
      await this.syncAccount(account.id, userId, baseUrl);
    } catch {
      // Keep account connected even if the first sync fails; the user can retry manually.
    }

    const refreshed = await this.getAccountForUser(account.id, userId);
    if (!refreshed) throw new Error("Failed to connect email account");
    return this.toSafeAccount(refreshed);
  }

  async listAccountsForUser(userId: number): Promise<EmailAccountSafe[]> {
    const rows = await db.select().from(emailAccounts)
      .where(eq(emailAccounts.userId, userId))
      .orderBy(desc(emailAccounts.createdAt));
    return rows.map((row) => this.toSafeAccount(row));
  }

  async disconnectAccount(accountId: number, userId: number): Promise<void> {
    const account = await this.getAccountForUser(accountId, userId);
    if (!account) throw new Error("Email account not found");
    await db.update(emailAccounts)
      .set({
        status: "disconnected",
        accessTokenEncrypted: null,
        refreshTokenEncrypted: null,
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(emailAccounts.id, accountId));
  }

  async syncAccount(accountId: number, userId: number | null, baseUrl: string): Promise<EmailSyncStatus> {
    const account = userId == null
      ? await this.getAccountById(accountId)
      : await this.getAccountForUser(accountId, userId);
    if (!account) throw new Error("Email account not found");

    const decrypted = await this.ensureFreshAccessToken(account, baseUrl);
    const cursors = await this.getCursorMap(account.id);

    try {
      const result = await this.providers[account.provider].syncMessages(decrypted, cursors, baseUrl);
      let newMessages = 0;
      for (const message of result.messages.sort((a, b) => (a.sentAt?.getTime() || 0) - (b.sentAt?.getTime() || 0))) {
        const upserted = await this.upsertMessage(account, message);
        if (upserted.created) newMessages += 1;
      }
      for (const cursor of result.cursors || []) {
        await this.saveCursor(account.id, cursor);
      }
      await db.update(emailAccounts)
        .set({
          lastSyncAt: new Date(),
          lastError: result.accountPatch?.lastError || null,
          webhookId: result.accountPatch?.webhookId ?? account.webhookId,
          webhookResource: result.accountPatch?.webhookResource ?? account.webhookResource,
          webhookExpiresAt: result.accountPatch?.webhookExpiresAt ?? account.webhookExpiresAt,
          status: "connected",
          updatedAt: new Date(),
        })
        .where(eq(emailAccounts.id, account.id));

      return {
        accountId: account.id,
        provider: account.provider,
        syncedMessages: result.messages.length,
        newMessages,
        lastSyncAt: new Date(),
        status: "connected",
        error: null,
      };
    } catch (error: any) {
      const message = String(error?.message || "Email sync failed");
      const status = message.toLowerCase().includes("invalid_grant") || message.toLowerCase().includes("unauthorized")
        ? "needs_reconnect"
        : "error";
      await db.update(emailAccounts)
        .set({
          status,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(emailAccounts.id, account.id));
      throw new Error(message);
    }
  }

  async listThreadsForUser(userId: number, filters: ThreadFilters = {}): Promise<EmailThreadWithDetails[]> {
    const threadIds = await this.getVisibleThreadIdsForUser(userId, filters);
    if (threadIds.length === 0) return [];

    const rows = await db.select().from(emailThreads)
      .where(inArray(emailThreads.id, threadIds))
      .orderBy(desc(emailThreads.lastMessageAt), desc(emailThreads.updatedAt));

    const linkMap = await this.getLinkMap(rows.map((row) => row.id));
    const latestMap = await this.getLatestMessageMap(rows.map((row) => row.id));
    const countMap = await this.getMessageCountMap(rows.map((row) => row.id));
    const accountIds = Array.from(new Set(rows.map((row) => row.accountId)));
    const accountRows = accountIds.length
      ? await db.select().from(emailAccounts).where(inArray(emailAccounts.id, accountIds))
      : [];
    const accountMap = new Map(accountRows.map((row) => [row.id, row]));

    const search = filters.search?.trim().toLowerCase();
    return rows
      .map((row) => {
        const account = accountMap.get(row.accountId) || null;
        const latest = latestMap.get(row.id) || null;
        const linked = linkMap.get(row.id) || [];
        return {
          ...row,
          account: account ? this.toSafeAccount(account) : null,
          links: linked,
          pendingResponse: this.isPendingResponse(row),
          messageCount: countMap.get(row.id) || 0,
          latestMessage: latest,
          canReply: account?.userId === userId && account.status === "connected",
        } satisfies EmailThreadWithDetails;
      })
      .filter((thread) => {
        if (!search) return true;
        const haystack = `${thread.subject} ${thread.snippet || ""} ${thread.latestMessage?.bodyText || ""}`.toLowerCase();
        return haystack.includes(search);
      });
  }

  async getThreadForUser(threadId: number, userId: number): Promise<EmailThreadWithDetails | null> {
    const visibleIds = await this.getVisibleThreadIdsForUser(userId, {});
    if (!visibleIds.includes(threadId)) return null;

    const [thread] = await db.select().from(emailThreads).where(eq(emailThreads.id, threadId));
    if (!thread) return null;

    const [account] = await db.select().from(emailAccounts).where(eq(emailAccounts.id, thread.accountId));
    const messages = await this.getMessagesForThread(threadId);
    const links = (await this.getLinkMap([threadId])).get(threadId) || [];
    return {
      ...thread,
      account: account ? this.toSafeAccount(account) : null,
      messages,
      links,
      latestMessage: messages[messages.length - 1] || null,
      messageCount: messages.length,
      pendingResponse: this.isPendingResponse(thread),
      canReply: account?.userId === userId && account.status === "connected",
    };
  }

  async linkThread(threadId: number, userId: number, executionId: number, taskId?: number | null): Promise<EmailThreadWithDetails> {
    const thread = await this.getThreadForUser(threadId, userId);
    if (!thread) throw new Error("Email thread not found");

    const execution = await storage.getExecution(executionId);
    if (!execution) throw new Error("Execution not found");

    if (taskId) {
      const task = await storage.getTask(taskId);
      if (!task) throw new Error("Task not found");
      if (task.executionId !== executionId) {
        throw new Error("Task does not belong to the selected execution");
      }
    }

    const existing = await db.select().from(emailLinks)
      .where(taskId
        ? and(
          eq(emailLinks.threadId, threadId),
          eq(emailLinks.executionId, executionId),
          eq(emailLinks.taskId, taskId),
        )
        : and(
          eq(emailLinks.threadId, threadId),
          eq(emailLinks.executionId, executionId),
          isNull(emailLinks.taskId),
        ));
    if (existing.length === 0) {
      await db.insert(emailLinks).values({
        threadId,
        executionId,
        taskId: taskId || null,
        linkedBy: userId,
      });
    }

    await db.update(emailThreads)
      .set({
        visibility: "shared",
        updatedAt: new Date(),
      })
      .where(eq(emailThreads.id, threadId));

    const refreshed = await this.getThreadForUser(threadId, userId);
    if (!refreshed) throw new Error("Failed to link email thread");
    return refreshed;
  }

  async sendMessage(userId: number, payload: { to: string; cc?: string; bcc?: string; subject: string; body: string; executionId?: number; taskId?: number; }, baseUrl: string): Promise<EmailThreadWithDetails> {
    const account = await this.getPrimaryConnectedAccountForUser(userId);
    if (!account) throw new Error("Connect an email account before sending");
    const decrypted = await this.ensureFreshAccessToken(account, baseUrl);

    const providerPayload: SendPayload = {
      to: dedupeParticipants(parseAddressList(payload.to)),
      cc: dedupeParticipants(parseAddressList(payload.cc)),
      bcc: dedupeParticipants(parseAddressList(payload.bcc)),
      subject: payload.subject.trim(),
      body: payload.body,
    };
    if (!providerPayload.to.length) {
      throw new Error("At least one recipient is required");
    }

    const normalized = await this.providers[account.provider].sendMessage(decrypted, providerPayload);
    const upserted = await this.upsertMessage(account, normalized);

    if (payload.executionId) {
      await this.linkThread(upserted.threadId, userId, payload.executionId, payload.taskId);
    } else if (payload.taskId) {
      const task = await storage.getTask(payload.taskId);
      if (!task) throw new Error("Task not found");
      await this.linkThread(upserted.threadId, userId, task.executionId, task.id);
    }

    const thread = await this.getThreadForUser(upserted.threadId, userId);
    if (!thread) throw new Error("Failed to fetch sent email thread");
    return thread;
  }

  async replyToThread(userId: number, threadId: number, body: string, baseUrl: string): Promise<EmailThreadWithDetails> {
    const thread = await this.getThreadForUser(threadId, userId);
    if (!thread) throw new Error("Email thread not found");
    if (!thread.account || thread.account.status !== "connected" || thread.account.userId !== userId) {
      throw new Error("This email thread is read-only");
    }

    const account = await this.getAccountForUser(thread.account.id, userId);
    if (!account) throw new Error("Email account not found");
    const decrypted = await this.ensureFreshAccessToken(account, baseUrl);
    const latestMessage = thread.messages?.[thread.messages.length - 1];
    if (!latestMessage) throw new Error("Cannot reply to an empty thread");

    const normalized = await this.providers[account.provider].replyToMessage(decrypted, latestMessage, thread, body);
    await this.upsertMessage(account, normalized);

    const refreshed = await this.getThreadForUser(threadId, userId);
    if (!refreshed) throw new Error("Failed to fetch updated thread");
    return refreshed;
  }

  async handleWebhook(provider: EmailProvider, body: any, query: Record<string, unknown>, baseUrl: string): Promise<{ validationToken?: string; syncedAccounts: number[] }> {
    const parsed = await this.providers[provider].parseWebhook(body, query);
    if (parsed.validationToken) {
      return { validationToken: parsed.validationToken, syncedAccounts: [] };
    }

    const synced = new Set<number>();
    for (const hint of parsed.hints) {
      const account = await this.resolveWebhookAccount(provider, hint);
      if (!account) continue;
      if (hint.historyId) {
        await this.saveCursor(account.id, { cursorType: "history", cursorValue: hint.historyId });
      }
      try {
        await this.syncAccount(account.id, null, baseUrl);
        synced.add(account.id);
      } catch {
        // Leave webhook processing best-effort to avoid retry storms.
      }
    }

    return { syncedAccounts: Array.from(synced) };
  }

  private async resolveWebhookAccount(provider: EmailProvider, hint: { emailAddress?: string; subscriptionId?: string }): Promise<EmailAccount | undefined> {
    if (hint.subscriptionId) {
      const [account] = await db.select().from(emailAccounts).where(and(
        eq(emailAccounts.provider, provider),
        eq(emailAccounts.webhookId, hint.subscriptionId),
      ));
      return account;
    }
    if (hint.emailAddress) {
      const [account] = await db.select().from(emailAccounts).where(and(
        eq(emailAccounts.provider, provider),
        eq(emailAccounts.emailAddress, hint.emailAddress),
      ));
      return account;
    }
    return undefined;
  }

  private async getVisibleThreadIdsForUser(userId: number, filters: ThreadFilters): Promise<number[]> {
    const accountRows = await db.select({ id: emailAccounts.id }).from(emailAccounts).where(eq(emailAccounts.userId, userId));
    const ownAccountIds = accountRows.map((row) => row.id);
    const threadIds = new Set<number>();

    if (!filters.executionId && !filters.taskId) {
      if (ownAccountIds.length) {
        const ownThreads = await db.select({ id: emailThreads.id }).from(emailThreads).where(inArray(emailThreads.accountId, ownAccountIds));
        ownThreads.forEach((row) => threadIds.add(row.id));
      }
      const sharedLinks = await db.select({ threadId: emailLinks.threadId }).from(emailLinks);
      sharedLinks.forEach((row) => threadIds.add(row.threadId));
      return Array.from(threadIds);
    }

    const conditions = [];
    if (filters.executionId) conditions.push(eq(emailLinks.executionId, filters.executionId));
    if (filters.taskId) conditions.push(eq(emailLinks.taskId, filters.taskId));
    const filteredLinks = await db.select({ threadId: emailLinks.threadId }).from(emailLinks)
      .where(and(...conditions));
    filteredLinks.forEach((row) => threadIds.add(row.threadId));
    return Array.from(threadIds);
  }

  private async getLinkMap(threadIds: number[]): Promise<Map<number, EmailLinkWithContext[]>> {
    const map = new Map<number, EmailLinkWithContext[]>();
    if (!threadIds.length) return map;
    const rows = await db.select().from(emailLinks).where(inArray(emailLinks.threadId, threadIds));
    for (const row of rows) {
      const execution = await storage.getExecution(row.executionId);
      const task = row.taskId ? await storage.getTask(row.taskId) : null;
      const enriched: EmailLinkWithContext = {
        ...row,
        execution: execution ? {
          id: execution.id,
          brandName: execution.brand?.name || null,
          titleName: execution.title?.name || null,
        } : undefined,
        task: task ? {
          id: task.id,
          title: task.title,
          status: task.status,
        } : null,
      };
      const current = map.get(row.threadId) || [];
      current.push(enriched);
      map.set(row.threadId, current);
    }
    return map;
  }

  private async getMessagesForThread(threadId: number): Promise<EmailMessageWithRecipients[]> {
    const rows = await db.select().from(emailMessages)
      .where(eq(emailMessages.threadId, threadId))
      .orderBy(asc(emailMessages.sentAt), asc(emailMessages.createdAt));
    if (!rows.length) return [];
    const messageIds = rows.map((row) => row.id);
    const recipientRows = await db.select().from(emailRecipients).where(inArray(emailRecipients.messageId, messageIds));
    const recipientsByMessage = new Map<number, typeof recipientRows>();
    for (const recipient of recipientRows) {
      const list = recipientsByMessage.get(recipient.messageId) || [];
      list.push(recipient);
      recipientsByMessage.set(recipient.messageId, list);
    }
    return rows.map((row) => ({
      ...row,
      recipients: recipientsByMessage.get(row.id) || [],
    }));
  }

  private async getLatestMessageMap(threadIds: number[]): Promise<Map<number, EmailMessageWithRecipients>> {
    const map = new Map<number, EmailMessageWithRecipients>();
    for (const threadId of threadIds) {
      const messages = await this.getMessagesForThread(threadId);
      const latest = messages[messages.length - 1];
      if (latest) map.set(threadId, latest);
    }
    return map;
  }

  private async getMessageCountMap(threadIds: number[]): Promise<Map<number, number>> {
    const map = new Map<number, number>();
    if (!threadIds.length) return map;
    const rows = await db.select().from(emailMessages).where(inArray(emailMessages.threadId, threadIds));
    for (const row of rows) {
      map.set(row.threadId, (map.get(row.threadId) || 0) + 1);
    }
    return map;
  }

  private async getPrimaryConnectedAccountForUser(userId: number): Promise<EmailAccount | undefined> {
    const [account] = await db.select().from(emailAccounts).where(and(
      eq(emailAccounts.userId, userId),
      eq(emailAccounts.status, "connected"),
    )).orderBy(desc(emailAccounts.updatedAt));
    return account;
  }

  private async getAccountById(accountId: number): Promise<EmailAccount | undefined> {
    const [account] = await db.select().from(emailAccounts).where(eq(emailAccounts.id, accountId));
    return account;
  }

  private async getAccountForUser(accountId: number, userId: number): Promise<EmailAccount | undefined> {
    const [account] = await db.select().from(emailAccounts).where(and(
      eq(emailAccounts.id, accountId),
      eq(emailAccounts.userId, userId),
    ));
    return account;
  }

  private toSafeAccount(account: EmailAccount): EmailAccountSafe {
    const { accessTokenEncrypted: _a, refreshTokenEncrypted: _r, ...rest } = account;
    return {
      ...rest,
      readOnly: rest.status !== "connected",
    };
  }

  private async ensureFreshAccessToken(account: EmailAccount, baseUrl: string): Promise<DecryptedAccount> {
    const decrypted: DecryptedAccount = {
      ...account,
      accessToken: decryptSecret(account.accessTokenEncrypted),
      refreshToken: decryptSecret(account.refreshTokenEncrypted),
    };

    const expiresAt = account.expiresAt ? new Date(account.expiresAt) : null;
    const needsRefresh = !decrypted.accessToken || (expiresAt && expiresAt.getTime() < Date.now() + 60_000);

    if (!needsRefresh) return decrypted;
    if (!decrypted.refreshToken) {
      throw new Error("Email account requires reconnection");
    }

    const refreshed = await this.providers[account.provider].refreshTokens(
      decrypted.refreshToken,
      `${baseUrl}/api/email/accounts/${account.provider}/callback`,
    );

    await db.update(emailAccounts)
      .set({
        accessTokenEncrypted: encryptSecret(refreshed.accessToken),
        refreshTokenEncrypted: encryptSecret(refreshed.refreshToken || decrypted.refreshToken),
        expiresAt: refreshed.expiresAt || null,
        tokenType: refreshed.tokenType || account.tokenType,
        scopes: refreshed.scopes || account.scopes,
        lastError: null,
        status: "connected",
        updatedAt: new Date(),
      })
      .where(eq(emailAccounts.id, account.id));

    return {
      ...account,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || decrypted.refreshToken,
      tokenType: refreshed.tokenType || account.tokenType,
      scopes: refreshed.scopes || safeJsonParse<string[]>(account.scopes, []),
      expiresAt: refreshed.expiresAt || account.expiresAt,
    };
  }

  private async getCursorMap(accountId: number): Promise<Map<EmailCursorType, { value?: string | null; expiresAt?: Date | null }>> {
    const rows = await db.select().from(emailSyncCursors).where(eq(emailSyncCursors.accountId, accountId));
    const map = new Map<EmailCursorType, { value?: string | null; expiresAt?: Date | null }>();
    for (const row of rows) {
      map.set(row.cursorType as EmailCursorType, {
        value: row.cursorValue,
        expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      });
    }
    return map;
  }

  private async saveCursor(accountId: number, cursor: ProviderCursor): Promise<void> {
    const [existing] = await db.select().from(emailSyncCursors).where(and(
      eq(emailSyncCursors.accountId, accountId),
      eq(emailSyncCursors.cursorType, cursor.cursorType),
    ));

    const values = {
      accountId,
      cursorType: cursor.cursorType,
      cursorValue: cursor.cursorValue || null,
      payload: cursor.payload || null,
      expiresAt: cursor.expiresAt || null,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(emailSyncCursors)
        .set(values)
        .where(eq(emailSyncCursors.id, existing.id));
    } else {
      await db.insert(emailSyncCursors).values(values);
    }
  }

  private async upsertMessage(account: EmailAccount, message: NormalizedEmailMessage): Promise<{ threadId: number; created: boolean }> {
    const [existingThread] = await db.select().from(emailThreads).where(and(
      eq(emailThreads.accountId, account.id),
      eq(emailThreads.providerThreadId, message.remoteThreadId),
    ));

    const direction: EmailDirection = normalizeEmail(message.sender?.email) === normalizeEmail(account.emailAddress)
      ? "outbound"
      : "inbound";
    const sentAt = message.sentAt || new Date();

    let thread = existingThread;
    if (!thread) {
      const [createdThread] = await db.insert(emailThreads).values({
        accountId: account.id,
        providerThreadId: message.remoteThreadId,
        providerConversationId: message.remoteConversationId || null,
        subject: message.subject || "",
        snippet: message.snippet || null,
        visibility: "private",
        lastMessageAt: sentAt,
        lastInboundAt: direction === "inbound" ? sentAt : null,
        lastOutboundAt: direction === "outbound" ? sentAt : null,
      }).returning();
      thread = createdThread;
    } else {
      await db.update(emailThreads)
        .set({
          providerConversationId: message.remoteConversationId || thread.providerConversationId,
          subject: message.subject || thread.subject,
          snippet: message.snippet || thread.snippet,
          lastMessageAt: !thread.lastMessageAt || sentAt.getTime() >= new Date(thread.lastMessageAt).getTime() ? sentAt : thread.lastMessageAt,
          lastInboundAt: direction === "inbound" && (!thread.lastInboundAt || sentAt.getTime() >= new Date(thread.lastInboundAt).getTime()) ? sentAt : thread.lastInboundAt,
          lastOutboundAt: direction === "outbound" && (!thread.lastOutboundAt || sentAt.getTime() >= new Date(thread.lastOutboundAt).getTime()) ? sentAt : thread.lastOutboundAt,
          updatedAt: new Date(),
        })
        .where(eq(emailThreads.id, thread.id));
      const [refetched] = await db.select().from(emailThreads).where(eq(emailThreads.id, thread.id));
      thread = refetched;
    }

    const [existingMessage] = await db.select().from(emailMessages).where(and(
      eq(emailMessages.accountId, account.id),
      eq(emailMessages.providerMessageId, message.remoteMessageId),
    ));

    if (existingMessage) {
      return { threadId: thread.id, created: false };
    }

    const [createdMessage] = await db.insert(emailMessages).values({
      accountId: account.id,
      threadId: thread.id,
      providerMessageId: message.remoteMessageId,
      internetMessageId: message.internetMessageId || null,
      direction,
      senderEmail: message.sender?.email || null,
      senderName: message.sender?.name || null,
      subject: message.subject || null,
      bodyText: message.bodyText || stripHtml(message.bodyHtml || ""),
      bodyHtml: message.bodyHtml || null,
      snippet: message.snippet || null,
      inReplyTo: message.inReplyTo || null,
      references: message.references || [],
      sentAt,
    }).returning();

    const recipients = [
      ...message.to.map((recipient) => ({ ...recipient, type: "to" as const })),
      ...message.cc.map((recipient) => ({ ...recipient, type: "cc" as const })),
      ...message.bcc.map((recipient) => ({ ...recipient, type: "bcc" as const })),
    ];
    if (recipients.length) {
      await db.insert(emailRecipients).values(recipients.map((recipient) => ({
        messageId: createdMessage.id,
        type: recipient.type,
        email: recipient.email,
        name: recipient.name || null,
      })));
    }

    if (direction === "inbound") {
      await this.notifyInboundReply(thread.id, account, createdMessage.id, message.sender);
    }

    return { threadId: thread.id, created: true };
  }

  private async notifyInboundReply(threadId: number, account: EmailAccount, entityId: number, sender?: EmailParticipant | null): Promise<void> {
    const thread = await this.getThreadForUser(threadId, account.userId);
    if (!thread) return;
    const links = thread.links || [];
    if (!links.length) return;

    const recipientIds = new Set<number>();
    recipientIds.add(account.userId);

    for (const link of links) {
      const executionRecipients = await notificationCenter.getExecutionRelatedUserIds(link.executionId);
      for (const recipientId of executionRecipients) recipientIds.add(recipientId);
      if (link.linkedBy) recipientIds.add(link.linkedBy);
      if (link.task?.id) {
        const taskRecipients = await notificationCenter.getTaskRelatedUserIds(link.task.id);
        for (const recipientId of taskRecipients) recipientIds.add(recipientId);
      }
    }

    await notificationCenter.sendNotification({
      recipientIds: Array.from(recipientIds),
      actorId: null,
      executionId: links[0].executionId,
      entityType: "email",
      entityId,
      type: "email_reply",
      payload: {
        threadId,
        subject: thread.subject,
        senderName: sender?.name || sender?.email || "External sender",
        taskId: links[0].task?.id || null,
      },
    });
  }

  private isPendingResponse(thread: Pick<EmailThreadWithDetails, "lastInboundAt" | "lastOutboundAt">): boolean {
    if (!thread.lastOutboundAt) return false;
    if (!thread.lastInboundAt) return true;
    return new Date(thread.lastOutboundAt).getTime() > new Date(thread.lastInboundAt).getTime();
  }
}

export const emailService = new EmailService();
