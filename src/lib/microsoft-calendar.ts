import { getMicrosoftGraphConfig } from "@/lib/settings";

interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface OutlookEvent {
  id: string;
  subject: string;
  bodyPreview?: string;
  isCancelled?: boolean;
  webLink?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string };
  attendees?: Array<{ emailAddress?: { address?: string; name?: string } }>;
}

function normalizeGraphDate(dateTime?: string): string | null {
  if (!dateTime) return null;
  if (dateTime.endsWith("Z") || /[+-]\d\d:\d\d$/.test(dateTime)) {
    return dateTime;
  }
  // Graph often returns naive datetime; we request UTC so append Z for ISO parsing.
  return `${dateTime}Z`;
}

async function getAppToken(): Promise<string> {
  const cfg = await getMicrosoftGraphConfig();

  const tenantId = cfg.MS_GRAPH_TENANT_ID || process.env.MS_GRAPH_TENANT_ID;
  const clientId = cfg.MS_GRAPH_CLIENT_ID || process.env.MS_GRAPH_CLIENT_ID;
  const clientSecret = cfg.MS_GRAPH_CLIENT_SECRET || process.env.MS_GRAPH_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft Graph settings missing. Set tenant, client ID and client secret in System Settings.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
    scope: "https://graph.microsoft.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as GraphTokenResponse;
  if (!data.access_token) {
    throw new Error("Microsoft token response missing access_token");
  }

  return data.access_token;
}

export async function fetchOutlookCalendarEvents(fromIso: string, toIso: string) {
  const cfg = await getMicrosoftGraphConfig();
  const mailboxUser = cfg.MS_GRAPH_MAILBOX_USER || process.env.MS_GRAPH_MAILBOX_USER;
  if (!mailboxUser) {
    throw new Error("Microsoft mailbox user missing. Set MS_GRAPH_MAILBOX_USER in System Settings.");
  }

  const token = await getAppToken();

  const endpoint = new URL(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUser)}/calendarView`);
  endpoint.searchParams.set("startDateTime", fromIso);
  endpoint.searchParams.set("endDateTime", toIso);
  endpoint.searchParams.set("$top", "200");
  endpoint.searchParams.set("$orderby", "start/dateTime");
  endpoint.searchParams.set("$select", "id,subject,bodyPreview,isCancelled,webLink,start,end,location,onlineMeeting,attendees");

  const res = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft calendar request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { value?: OutlookEvent[] };
  const events = (data.value || []).map((evt) => ({
    id: evt.id,
    title: evt.subject || "(No title)",
    description: evt.bodyPreview || null,
    status: evt.isCancelled ? "CANCELLED" : "SCHEDULED",
    type: evt.onlineMeeting?.joinUrl ? "VIDEO" : "CALL",
    location: evt.location?.displayName || null,
    meetingUrl: evt.onlineMeeting?.joinUrl || evt.webLink || null,
    startsAt: normalizeGraphDate(evt.start?.dateTime),
    endsAt: normalizeGraphDate(evt.end?.dateTime),
    notes: null as string | null,
    source: "OUTLOOK_TEAMS",
    attendeeEmails: (evt.attendees || [])
      .map((a) => a.emailAddress?.address)
      .filter((x): x is string => Boolean(x)),
  }));

  return events.filter((e) => Boolean(e.startsAt) && Boolean(e.endsAt));
}
