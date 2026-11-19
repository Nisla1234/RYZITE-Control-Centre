import crypto from 'crypto';
import type { AnalyticsDateRange, AnalyticsReport } from '../src/types/cms.ts';

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function getGa4ConfigStatus() {
  const missingVars: string[] = [];
  if (!process.env.GA4_PROPERTY_ID) missingVars.push('GA4_PROPERTY_ID');
  if (!process.env.GA4_CLIENT_EMAIL) missingVars.push('GA4_CLIENT_EMAIL');
  if (!process.env.GA4_PRIVATE_KEY) missingVars.push('GA4_PRIVATE_KEY');

  const configured = missingVars.length === 0;
  return {
    configured,
    propertyId: process.env.GA4_PROPERTY_ID || null,
    missingVars,
    message: configured
      ? `Connected to Google Analytics 4 property ${process.env.GA4_PROPERTY_ID}.`
      : `Google Analytics 4 is not connected. Configure ${missingVars.join(', ')} in server environment variables to load live website traffic data.`,
  };
}

function resolveDateRange(range: AnalyticsDateRange): { startDate: string; endDate: string; label: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const subDays = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return fmt(d);
  };

  switch (range.preset) {
    case 'today':
      return { startDate: 'today', endDate: 'today', label: 'Today' };
    case 'yesterday':
      return { startDate: 'yesterday', endDate: 'yesterday', label: 'Yesterday' };
    case '7d':
      return { startDate: '7daysAgo', endDate: 'today', label: 'Last 7 days' };
    case '30d':
      return { startDate: '30daysAgo', endDate: 'today', label: 'Last 30 days' };
    case '90d':
      return { startDate: '90daysAgo', endDate: 'today', label: 'Last 90 days' };
    case 'custom':
      return {
        startDate: range.startDate || subDays(30),
        endDate: range.endDate || fmt(today),
        label: `${range.startDate || subDays(30)} to ${range.endDate || fmt(today)}`,
      };
    default:
      return { startDate: '30daysAgo', endDate: 'today', label: 'Last 30 days' };
  }
}

async function getGoogleAccessToken(): Promise<string> {
  const clientEmail = process.env.GA4_CLIENT_EMAIL!;
  const privateKey = process.env.GA4_PRIVATE_KEY!.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  );

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  sign.end();
  const signature = base64Url(sign.sign(privateKey));
  const assertion = `${header}.${claim}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    throw new Error(`Google OAuth token exchange failed (${tokenRes.status}): ${text}`);
  }

  const data = (await tokenRes.json()) as { access_token: string };
  return data.access_token;
}

async function runGa4Report(accessToken: string, propertyId: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GA4 Data API error (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function fetchGa4Analytics(range: AnalyticsDateRange): Promise<AnalyticsReport> {
  const status = getGa4ConfigStatus();
  const resolved = resolveDateRange(range);

  if (!status.configured) {
    return {
      configured: false,
      missingVars: status.missingVars,
      dateRange: resolved,
    };
  }

  try {
    const accessToken = await getGoogleAccessToken();
    const propertyId = status.propertyId!;
    const dateRanges = [{ startDate: resolved.startDate, endDate: resolved.endDate }];

    const [
      summaryRes,
      trendRes,
      pagesRes,
      landingRes,
      channelsRes,
      sourcesRes,
      countriesRes,
      citiesRes,
      devicesRes,
      browsersRes,
    ] = await Promise.all([
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        metrics: [
          { name: 'totalUsers' },
          { name: 'activeUsers' },
          { name: 'newUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'engagementRate' },
          { name: 'userEngagementDuration' },
        ],
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'date' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'userEngagementDuration' }],
        limit: 10,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'landingPage' }],
        metrics: [{ name: 'sessions' }, { name: 'engagementRate' }],
        limit: 8,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        limit: 8,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'sessionSourceMedium' }],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }],
        limit: 8,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'country' }],
        metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
        limit: 10,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'city' }, { name: 'country' }],
        metrics: [{ name: 'totalUsers' }],
        limit: 10,
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'totalUsers' }],
      }),
      runGa4Report(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: 'browser' }],
        metrics: [{ name: 'totalUsers' }],
        limit: 8,
      }),
    ]);

    const sRow = summaryRes.rows?.[0]?.metricValues || [];
    const totalUsers = Number(sRow[0]?.value || 0);
    const activeUsers = Number(sRow[1]?.value || 0);
    const newUsers = Number(sRow[2]?.value || 0);
    const sessions = Number(sRow[3]?.value || 0);
    const pageViews = Number(sRow[4]?.value || 0);
    const engagementRate = Number(sRow[5]?.value || 0) * 100;
    const totalEngagementSec = Number(sRow[6]?.value || 0);
    const avgEngagementDurationSec = activeUsers > 0 ? Math.round(totalEngagementSec / activeUsers) : 0;

    const totalDeviceUsers = (devicesRes.rows || []).reduce(
      (acc: number, r: any) => acc + Number(r.metricValues?.[0]?.value || 0),
      0
    );
    const totalBrowserUsers = (browsersRes.rows || []).reduce(
      (acc: number, r: any) => acc + Number(r.metricValues?.[0]?.value || 0),
      0
    );

    return {
      configured: true,
      propertyId,
      dateRange: resolved,
      summary: {
        totalUsers,
        activeUsers,
        newUsers,
        returningUsers: Math.max(0, totalUsers - newUsers),
        sessions,
        pageViews,
        engagementRate: Number(engagementRate.toFixed(1)),
        avgEngagementDurationSec,
      },
      dailyTrend: (trendRes.rows || []).map((r: any) => {
        const raw = r.dimensionValues?.[0]?.value || '';
        const formattedDate = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
        return {
          date: formattedDate,
          users: Number(r.metricValues?.[0]?.value || 0),
          sessions: Number(r.metricValues?.[1]?.value || 0),
          pageViews: Number(r.metricValues?.[2]?.value || 0),
        };
      }),
      topPages: (pagesRes.rows || []).map((r: any) => {
        const u = Number(r.metricValues?.[1]?.value || 0);
        const dur = Number(r.metricValues?.[2]?.value || 0);
        return {
          path: r.dimensionValues?.[0]?.value || '/',
          title: r.dimensionValues?.[1]?.value || '(Untitled)',
          views: Number(r.metricValues?.[0]?.value || 0),
          users: u,
          avgDurationSec: u > 0 ? Math.round(dur / u) : 0,
        };
      }),
      landingPages: (landingRes.rows || []).map((r: any) => ({
        path: r.dimensionValues?.[0]?.value || '/',
        sessions: Number(r.metricValues?.[0]?.value || 0),
        engagementRate: Number((Number(r.metricValues?.[1]?.value || 0) * 100).toFixed(1)),
      })),
      channels: (channelsRes.rows || []).map((r: any) => ({
        channel: r.dimensionValues?.[0]?.value || 'Direct',
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
      })),
      sources: (sourcesRes.rows || []).map((r: any) => ({
        sourceMedium: r.dimensionValues?.[0]?.value || '(direct) / (none)',
        sessions: Number(r.metricValues?.[0]?.value || 0),
        users: Number(r.metricValues?.[1]?.value || 0),
      })),
      countries: (countriesRes.rows || []).map((r: any) => ({
        country: r.dimensionValues?.[0]?.value || 'Unknown',
        users: Number(r.metricValues?.[0]?.value || 0),
        sessions: Number(r.metricValues?.[1]?.value || 0),
      })),
      cities: (citiesRes.rows || []).map((r: any) => ({
        city: r.dimensionValues?.[0]?.value || 'Unknown',
        country: r.dimensionValues?.[1]?.value || '',
        users: Number(r.metricValues?.[0]?.value || 0),
      })),
      devices: (devicesRes.rows || []).map((r: any) => {
        const users = Number(r.metricValues?.[0]?.value || 0);
        return {
          device: r.dimensionValues?.[0]?.value || 'Unknown',
          users,
          sharePct: totalDeviceUsers > 0 ? Number(((users / totalDeviceUsers) * 100).toFixed(1)) : 0,
        };
      }),
      browsers: (browsersRes.rows || []).map((r: any) => {
        const users = Number(r.metricValues?.[0]?.value || 0);
        return {
          browser: r.dimensionValues?.[0]?.value || 'Unknown',
          users,
          sharePct: totalBrowserUsers > 0 ? Number(((users / totalBrowserUsers) * 100).toFixed(1)) : 0,
        };
      }),
    };
  } catch (err: any) {
    return {
      configured: true,
      propertyId: status.propertyId || undefined,
      error: err?.message || 'Failed to query Google Analytics 4 Data API.',
      dateRange: resolved,
    };
  }
}
