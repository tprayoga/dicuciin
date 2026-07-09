-- Immutability guard untuk wallet_ledgers (single source of truth mutasi saldo).
--
-- wallet_ledgers bersifat APPEND-ONLY: baris yang sudah tercatat TIDAK boleh
-- diubah (amount/balance/direction/dll immutable) demi integritas audit trail
-- finansial. Koreksi dilakukan dengan MENAMBAH baris REVERSAL/ADJUSTMENT baru,
-- bukan meng-UPDATE histori.
--
-- Catatan DELETE: sengaja TIDAK diblokir. Relasi Wallet→WalletLedger memakai
-- onDelete: Cascade, dan penghapusan User/Customer (mis. users.service.remove)
-- meng-cascade hingga ledger. Memblokir DELETE akan mematahkan penghapusan akun.
-- Kode aplikasi tidak pernah menghapus baris ledger secara langsung; DELETE hanya
-- terjadi via cascade saat seluruh akun dihapus.

CREATE OR REPLACE FUNCTION wallet_ledgers_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_ledgers is append-only: UPDATE tidak diizinkan (gunakan baris REVERSAL/ADJUSTMENT baru)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_ledgers_immutable ON wallet_ledgers;

CREATE TRIGGER wallet_ledgers_immutable
  BEFORE UPDATE ON wallet_ledgers
  FOR EACH ROW EXECUTE FUNCTION wallet_ledgers_no_update();
