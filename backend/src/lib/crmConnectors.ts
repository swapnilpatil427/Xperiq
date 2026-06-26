export interface NormalizedContact {
  external_id?: string;
  email?: string;
  name?: string;
  phone?: string;
  account_name?: string;
  account_id?: string;
}

export interface ProviderConfig {
  api_key?: string;
  instance_url?: string;
  access_token?: string;
  url?: string;
  auth_header?: string;
}

export interface FieldMapping {
  source: string;
  dest: keyof NormalizedContact;
}

function applyMappings(raw: Record<string, unknown>, mappings: FieldMapping[]): NormalizedContact {
  const contact: NormalizedContact = {};
  for (const { source, dest } of mappings) {
    const val = raw[source];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      (contact as Record<string, unknown>)[dest] = String(val).trim();
    }
  }
  return contact;
}

export async function fetchFromHubSpot(config: ProviderConfig, mappings: FieldMapping[]): Promise<NormalizedContact[]> {
  const contacts: NormalizedContact[] = [];
  const properties = mappings.map((m) => m.source).join(',');
  let after: string | undefined;

  do {
    const url = new URL('https://api.hubapi.com/crm/v3/objects/contacts');
    url.searchParams.set('limit', '100');
    url.searchParams.set('properties', properties);
    if (after) url.searchParams.set('after', after);

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${config.api_key}`, 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error(`HubSpot API error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as { results: unknown[]; paging?: { next?: { after: string } } };

    for (const item of data.results) {
      const raw = (item as Record<string, unknown>).properties as Record<string, unknown> ?? {};
      raw['hs_object_id'] = (item as Record<string, unknown>).id;
      contacts.push(applyMappings(raw, mappings));
    }
    after = data.paging?.next?.after;
  } while (after);

  return contacts;
}

export async function fetchFromSalesforce(config: ProviderConfig, mappings: FieldMapping[]): Promise<NormalizedContact[]> {
  const contacts: NormalizedContact[] = [];
  const sfFields = mappings.map((m) => m.source).join(', ');
  let nextUrl: string | null = `${config.instance_url}/services/data/v57.0/query/?q=${encodeURIComponent(`SELECT ${sfFields} FROM Contact LIMIT 200`)}`;

  while (nextUrl) {
    const resp = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error(`Salesforce API error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as { records: unknown[]; nextRecordsUrl?: string; done: boolean };

    for (const record of data.records) {
      contacts.push(applyMappings(record as Record<string, unknown>, mappings));
    }
    nextUrl = data.done ? null : `${config.instance_url}${data.nextRecordsUrl}`;
  }
  return contacts;
}

export async function fetchFromCsvUrl(config: ProviderConfig, mappings: FieldMapping[]): Promise<NormalizedContact[]> {
  const headers: Record<string, string> = {};
  if (config.auth_header) headers['Authorization'] = config.auth_header;
  const resp = await fetch(config.url!, { headers });
  if (!resp.ok) throw new Error(`CSV URL error ${resp.status}`);
  const text = await resp.text();
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const csvHeaders = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const vals = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const raw: Record<string, unknown> = {};
    csvHeaders.forEach((h, i) => { raw[h] = vals[i] ?? ''; });
    return applyMappings(raw, mappings);
  }).filter((c) => c.email || c.external_id);
}

export async function fetchContacts(provider: string, config: ProviderConfig, mappings: FieldMapping[]): Promise<NormalizedContact[]> {
  switch (provider) {
    case 'hubspot':    return fetchFromHubSpot(config, mappings);
    case 'salesforce': return fetchFromSalesforce(config, mappings);
    case 'csv_url':    return fetchFromCsvUrl(config, mappings);
    default:           return []; // webhook is inbound, no fetch
  }
}
