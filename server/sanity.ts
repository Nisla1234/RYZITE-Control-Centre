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

  const rows = await dbAll<{ data_json: string }>(
    'SELECT data_json FROM cms_documents WHERE doc_type = $1 ORDER BY updated_at DESC',
    [docType]
  );
  return rows.map((r) => JSON.parse(r.data_json) as T);
}

export async function getDocument<T>(docType: string, id: string): Promise<T | null> {
  const row = await dbGet<{ data_json: string }>(
    'SELECT data_json FROM cms_documents WHERE doc_type = $1 AND id = $2',
    [docType, id]
  );
  return row ? (JSON.parse(row.data_json) as T) : null;
}

export async function saveDocument<T extends { id: string; status: string }>(
  docType: string,
  doc: T,
  updatedBy: string
): Promise<T> {
  const now = new Date().toISOString();
  const payload = { ...doc, updatedAt: now, updatedBy };

  if (hasSanityWriteToken()) {
    try {
      const client = getSanityClient();
      const sanityId = doc.status === 'draft' ? `drafts.${doc.id}` : doc.id;
      await client.createOrReplace({
        ...payload,
        _id: sanityId,
        _type: docType,
      });
      if (doc.status === 'published') {
        await client.delete(`drafts.${doc.id}`).catch(() => {});
      }
    } catch (err) {
      console.error('[Sanity Write Error]', err);
    }
  }

  await dbRun(
    `INSERT INTO cms_documents (id, doc_type, status, data_json, updated_at, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(id) DO UPDATE SET
       status = EXCLUDED.status,
       data_json = EXCLUDED.data_json,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [doc.id, docType, doc.status, JSON.stringify(payload), now, updatedBy]
  );

  return payload;
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
