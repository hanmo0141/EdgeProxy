/**
 * DNS over HTTPS 查询
 */

interface DNSRecord {
  type: number;
  name: string;
  data: string;
  TTL: number;
}

/** DoH 查询 */
export async function dohQuery(hostname: string, type: 'A' | 'AAAA' = 'A'): Promise<DNSRecord[]> {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=${type}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json() as { Answer?: DNSRecord[] };
    return data.Answer || [];
  } catch {
    return [];
  }
}
