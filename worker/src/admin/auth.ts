/**
 * 管理员认证
 */
import { md5 } from '../utils/crypto';

/** 验证登录 Cookie */
export async function verifyAuth(request: Request, adminPassword: string, encryptionKey: string): Promise<boolean> {
  const cookies = request.headers.get('Cookie') || '';
  const authCookie = cookies.split(';').find(c => c.trim().startsWith('auth='))?.split('=')[1];
  if (!authCookie) return false;

  const ua = request.headers.get('User-Agent') || '';
  const expected = await md5(ua + encryptionKey + adminPassword);
  return authCookie === expected;
}

/** 生成认证 Cookie 值 */
export async function generateAuthCookie(ua: string, encryptionKey: string, adminPassword: string): Promise<string> {
  return md5(ua + encryptionKey + adminPassword);
}

/** 检查是否是 UUID 格式 */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(uuid);
}

/** 计算 UUID 前8位总和 */
function uuidPrefixSum(uuid: string): number {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const code = uuid.charCodeAt(i);
    sum += code <= 57 ? code - 48 : code - 87;
  }
  return sum;
}

/** 验证版本查询的 UUID */
export function verifyVersionUUID(requestUUID: string, targetUUID: string): boolean {
  return uuidPrefixSum(requestUUID) === uuidPrefixSum(targetUUID) &&
         requestUUID.slice(-12) === targetUUID.slice(-12);
}
