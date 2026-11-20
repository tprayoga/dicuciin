/**
 * Pengaman: test keamanan HANYA boleh berjalan pada PostgreSQL lokal yang
 * namanya berakhiran `_test` (tabel dikosongkan setiap test).
 */
const url = process.env.SECURITY_TEST_DATABASE_URL;
if (!url) {
  throw new Error('SECURITY_TEST_DATABASE_URL wajib diisi (PostgreSQL lokal, nama DB berakhiran _test)');
}
const parsed = new URL(url);
const db = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !db.endsWith('_test')) {
  throw new Error(`Menolak menjalankan test pada ${parsed.hostname}/${db} — hanya DB lokal *_test`);
}
process.env.DATABASE_URL = url;
