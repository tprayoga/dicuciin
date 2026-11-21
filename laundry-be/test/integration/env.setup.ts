/**
 * Integration test memakai PostgreSQL NYATA di lingkungan terisolasi.
 * Wajib: TEST_DATABASE_URL (mis. postgresql://test:test@127.0.0.1:55499/dicuciin_test).
 * Pengaman: hanya host lokal & nama database berakhiran `_test`, karena setiap
 * test MENGOSONGKAN semua tabel.
 */
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error('TEST_DATABASE_URL wajib diisi untuk integration test (database PostgreSQL uji terisolasi)');
}
const parsed = new URL(url);
const dbName = parsed.pathname.replace(/^\//, '');
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !dbName.endsWith('_test')) {
  throw new Error(
    `Menolak menjalankan integration test terhadap ${parsed.hostname}/${dbName}: hanya database lokal berakhiran _test`,
  );
}
process.env.DATABASE_URL = url;
process.env.APP_ENV = 'test';
