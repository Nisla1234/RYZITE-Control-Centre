import crypto from 'crypto';
import { createClient, type SanityClient } from '@sanity/client';
import { dbAll, dbGet, dbRun } from './db.ts';

export const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || 'hnm8jy5w';
export const SANITY_DATASET = process.env.SANITY_DATASET || 'staging';
export const SANITY_API_VERSION = process.env.SANITY_API_VERSION || '2024-01-01';

export function hasSanityWriteToken(): boolean {
  return Boolean(process.env.SANITY_API_TOKEN && process.env.SANITY_API_TOKEN.trim().length > 10);
}

export function getSanityClient(datasetOverride?: string): SanityClient {
  return createClient({
    projectId: SANITY_PROJECT_ID,
    dataset: datasetOverride || SANITY_DATASET,
    apiVersion: SANITY_API_VERSION,
    useCdn: false,
    token: process.env.SANITY_API_TOKEN || undefined,
  });
}

export async function inspectSanityProject(): Promise<{
  projectId: string;
  dataset: string;
  apiVersion: string;
  writeTokenConfigured: boolean;
  reachable: boolean;
  mode: 'sanity_live' | 'local_staging';
  existingTypes: string[];
  message: string;
}> {
  const writeTokenConfigured = hasSanityWriteToken();
  let reachable = false;
  let existingTypes: string[] = [];

  try {
    const readClient = getSanityClient('production');
    const types = await readClient.fetch<string[]>(`array::unique(*[!(_id in path("_.**"))]._type)`);
    reachable = true;
    existingTypes = Array.isArray(types) ? types.filter(Boolean) : [];
  } catch {
    reachable = false;
  }

  if (writeTokenConfigured && reachable) {
    return {
      projectId: SANITY_PROJECT_ID,
      dataset: SANITY_DATASET,
      apiVersion: SANITY_API_VERSION,
      writeTokenConfigured: true,
      reachable: true,
      mode: 'sanity_live',
      existingTypes,
      message: `Connected to Sanity project "${SANITY_PROJECT_ID}" (dataset: ${SANITY_DATASET}). Write operations are enabled.`,
    };
  }

  return {
    projectId: SANITY_PROJECT_ID,
    dataset: SANITY_DATASET,
    apiVersion: SANITY_API_VERSION,
    writeTokenConfigured,
    reachable,
    mode: 'local_staging',
    existingTypes,
    message: writeTokenConfigured
      ? `Sanity write token is present, but dataset "${SANITY_DATASET}" could not be reached. Operating safely in database staging mode.`
      : `Read-only inspection connected to Sanity project "${SANITY_PROJECT_ID}". Configure SANITY_API_TOKEN in server environment variables to enable live Sanity writes.`,
  };
}

export async function listDocuments<T>(docType: string): Promise<T[]> {
  if (hasSanityWriteToken()) {
    try {
      const client = getSanityClient();
      const docs = await client.fetch<T[]>(
        `*[_type == $docType] | order(_updatedAt desc)`,
        { docType }
      );
      if (Array.isArray(docs) && docs.length > 0) return docs;
    } catch {
      // Fallback to database staging store
    }
  }

  const rows = await dbAll<{
    data_json: string;
    published_json: string | null;
    published_at: string | null;
    published_by: string | null;
  }>(
    'SELECT data_json, published_json, published_at, published_by FROM cms_documents WHERE doc_type = $1 ORDER BY updated_at DESC',
    [docType]
  );
  return rows.map((r) => {
    const doc = JSON.parse(r.data_json);
    const hasUnpublishedChanges =
      Boolean(r.published_json) && r.published_json !== r.data_json;
    return {
      ...doc,
      publishedAt: r.published_at ?? doc.publishedAt ?? null,
      publishedBy: r.published_by ?? doc.publishedBy ?? null,
      hasUnpublishedChanges,
    } as T;
  });
}

export async function listPublishedDocuments<T>(docType: string): Promise<T[]> {
  const rows = await dbAll<{
    published_json: string | null;
    published_at: string | null;
    published_by: string | null;
  }>(
    `SELECT published_json, published_at, published_by
     FROM cms_documents
     WHERE doc_type = $1 AND published_json IS NOT NULL
     ORDER BY COALESCE(published_at, updated_at) DESC`,
    [docType]
  );
  return rows
    .filter((r) => Boolean(r.published_json))
    .map((r) => {
      const doc = JSON.parse(r.published_json!);
      return {
        ...doc,
        status: 'published',
        publishedAt: r.published_at ?? doc.publishedAt ?? null,
        publishedBy: r.published_by ?? doc.publishedBy ?? null,
      } as T;
    });
}

export async function getDocument<T>(docType: string, id: string): Promise<T | null> {
  const row = await dbGet<{
    data_json: string;
    published_json: string | null;
    published_at: string | null;
    published_by: string | null;
  }>(
    'SELECT data_json, published_json, published_at, published_by FROM cms_documents WHERE doc_type = $1 AND id = $2',
    [docType, id]
  );
  if (!row) return null;
  const doc = JSON.parse(row.data_json);
  return {
    ...doc,
    publishedAt: row.published_at ?? doc.publishedAt ?? null,
    publishedBy: row.published_by ?? doc.publishedBy ?? null,
    hasUnpublishedChanges: Boolean(row.published_json) && row.published_json !== row.data_json,
  } as T;
}

export async function recordRevision(params: {
  docType: string;
  docId: string;
  action: string;
  status: string;
  data: any;
  summary: string;
  createdBy: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO cms_revisions (id, doc_type, doc_id, action, status, data_json, summary, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      params.docType,
      params.docId,
      params.action,
      params.status,
      JSON.stringify(params.data),
      params.summary,
      now,
      params.createdBy,
    ]
  );
  return id;
}

export async function listRevisions(docType: string, docId: string, limit = 25) {
  const rows = await dbAll<any>(
    `SELECT * FROM cms_revisions
     WHERE doc_type = $1 AND doc_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [docType, docId, limit]
  );
  return rows.map((r) => ({
    id: r.id,
    docType: r.doc_type,
    docId: r.doc_id,
    action: r.action,
    status: r.status,
    data: JSON.parse(r.data_json),
    summary: r.summary,
    createdAt: r.created_at,
    createdBy: r.created_by,
  }));
}

export async function getRevisionById(revId: string) {
  const r = await dbGet<any>('SELECT * FROM cms_revisions WHERE id = $1', [revId]);
  if (!r) return null;
  return {
    id: r.id,
    docType: r.doc_type,
    docId: r.doc_id,
    action: r.action,
    status: r.status,
    data: JSON.parse(r.data_json),
    summary: r.summary,
    createdAt: r.created_at,
    createdBy: r.created_by,
  };
}

export async function saveDocument<T extends { id: string; status: string }>(
  docType: string,
  doc: T,
  updatedBy: string,
  options?: { unpublish?: boolean; revisionAction?: string; revisionSummary?: string }
): Promise<T> {
  const now = new Date().toISOString();
  const existing = await dbGet<{
    published_json: string | null;
    published_at: string | null;
    published_by: string | null;
  }>('SELECT published_json, published_at, published_by FROM cms_documents WHERE id = $1', [
    doc.id,
  ]);

  const isPublishing = doc.status === 'published' && !options?.unpublish;
  const cleanDoc: any = { ...doc };
  delete cleanDoc.hasUnpublishedChanges;

  const payload: any = {
    ...cleanDoc,
    updatedAt: now,
    updatedBy,
    publishedAt: isPublishing
      ? now
      : options?.unpublish
        ? null
        : existing?.published_at ?? cleanDoc.publishedAt ?? null,
    publishedBy: isPublishing
      ? updatedBy
      : options?.unpublish
        ? null
        : existing?.published_by ?? cleanDoc.publishedBy ?? null,
  };

  const payloadJson = JSON.stringify(payload);
  const nextPublishedJson = isPublishing
    ? payloadJson
    : options?.unpublish
      ? null
      : existing?.published_json ?? null;
  const nextPublishedAt = payload.publishedAt;
  const nextPublishedBy = payload.publishedBy;

  if (hasSanityWriteToken()) {
    try {
      const client = getSanityClient();
      const sanityId = doc.status === 'draft' ? `drafts.${doc.id}` : doc.id;
      await client.createOrReplace({
        ...payload,
        _id: sanityId,
        _type: docType,
      });
      if (isPublishing) {
        await client.delete(`drafts.${doc.id}`).catch(() => {});
      }
    } catch (err) {
      console.error('[Sanity Write Error]', err);
    }
  }

  await dbRun(
    `INSERT INTO cms_documents (id, doc_type, status, data_json, published_json, published_at, published_by, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT(id) DO UPDATE SET
       status = EXCLUDED.status,
       data_json = EXCLUDED.data_json,
       published_json = EXCLUDED.published_json,
       published_at = EXCLUDED.published_at,
       published_by = EXCLUDED.published_by,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [
      doc.id,
      docType,
      doc.status,
      payloadJson,
      nextPublishedJson,
      nextPublishedAt,
      nextPublishedBy,
      now,
      updatedBy,
    ]
  );

  // Record a revision snapshot
  await recordRevision({
    docType,
    docId: doc.id,
    action: options?.revisionAction || (isPublishing ? 'publish' : options?.unpublish ? 'unpublish' : 'save_draft'),
    status: doc.status,
    data: payload,
    summary:
      options?.revisionSummary ||
      (isPublishing
        ? 'Published changes to live website'
        : options?.unpublish
          ? 'Unpublished from live website'
          : 'Saved draft changes'),
    createdBy: updatedBy,
  });

  return {
    ...payload,
    hasUnpublishedChanges: Boolean(nextPublishedJson) && nextPublishedJson !== payloadJson,
  } as T;
}

export async function deleteDocument(docType: string, id: string): Promise<boolean> {
  if (hasSanityWriteToken()) {
    try {
      const client = getSanityClient();
      await client.delete(id).catch(() => {});
      await client.delete(`drafts.${id}`).catch(() => {});
    } catch (err) {
      console.error('[Sanity Delete Error]', err);
    }
  }

  const info = await dbRun('DELETE FROM cms_documents WHERE doc_type = $1 AND id = $2', [docType, id]);
  return info.changes > 0;
}
