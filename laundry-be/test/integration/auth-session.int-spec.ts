/**
 * Batch 5 — autentikasi, refresh token, sesi & manajemen akun pada PostgreSQL
 * NYATA via HTTP + JWT asli (JwtStrategy memeriksa sesi di database).
 * WhatsApp diganti tiruan (tidak ada pesan nyata).
 */
import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import * as request from "supertest";
import * as bcrypt from "bcrypt";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { JwtAuthGuard } from "../../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../../src/common/guards/roles.guard";
import { TransformInterceptor } from "../../src/common/interceptors/transform.interceptor";
import { JwtStrategy } from "../../src/modules/auth/jwt.strategy";
import { AuthController } from "../../src/modules/auth/auth.controller";
import { AuthService } from "../../src/modules/auth/auth.service";
import { OtpService } from "../../src/modules/auth/otp.service";
import { WhatsappService } from "../../src/modules/notifications/whatsapp.service";
import { UsersController } from "../../src/modules/users/users.controller";
import { UsersService } from "../../src/modules/users/users.service";
import { resetDb } from "./helpers";

const ACCESS_SECRET = "integration-access-secret";
const REFRESH_SECRET = "integration-refresh-secret";
const PASSWORD = "Rahasia123!";

const env: Record<string, string | undefined> = {};
const wa = {
  configured: true,
  devAllowed: true,
  fail: false,
  sent: [] as { phone: string; message: string }[],
};

describe("Batch 5 — autentikasi, refresh token & akun (PostgreSQL nyata)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let http: () => any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({})],
      controllers: [AuthController, UsersController],
      providers: [
        PrismaService,
        JwtStrategy,
        AuthService,
        OtpService,
        UsersService,
        {
          provide: ConfigService,
          useValue: {
            get: (k: string, d?: any) => {
              if (k in env && env[k] !== undefined) return env[k];
              if (k === "JWT_ACCESS_SECRET") return ACCESS_SECRET;
              if (k === "JWT_REFRESH_SECRET") return REFRESH_SECRET;
              if (k === "BCRYPT_SALT_ROUNDS") return "4";
              return d;
            },
          },
        },
        {
          provide: WhatsappService,
          useValue: {
            isConfigured: () => wa.configured,
            devFallbackAllowed: () => wa.devAllowed,
            sendText: jest.fn(async (phone: string, message: string) => {
              if (wa.fail) throw new Error("provider down");
              wa.sent.push({ phone, message });
            }),
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.init();
    // Lihat Batch 4: listen sekali, bind loopback eksplisit.
    await app.listen(0, "127.0.0.1");
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
    http = () => request(app.getHttpServer());
  });
  afterAll(() => app.close());

  beforeEach(async () => {
    await resetDb(prisma);
    for (const k of Object.keys(env)) delete env[k];
    wa.configured = true;
    wa.devAllowed = true;
    wa.fail = false;
    wa.sent = [];
  });

  // ------------------------------------------------------------ helpers
  const hash = (p: string) => bcrypt.hashSync(p, 4);

  async function user(opts: { phone?: string; role?: UserRole; password?: string; email?: string } = {}) {
    return prisma.user.create({
      data: {
        name: "Uji",
        phone: opts.phone ?? null,
        email: opts.email ?? null,
        role: opts.role ?? UserRole.CUSTOMER,
        passwordHash: hash(opts.password ?? PASSWORD),
      },
    });
  }

  const data = (r: any) => r.body?.data ?? r.body;

  async function login(identifier: string, password = PASSWORD) {
    const r = await http().post("/auth/login").send({ identifier, password });
    return r;
  }

  async function loginOk(identifier: string, password = PASSWORD) {
    const r = await login(identifier, password);
    expect(r.status).toBe(201);
    return data(r) as { accessToken: string; refreshToken: string; user: any };
  }

  const me = (access: string) => http().get("/auth/me").set("Authorization", `Bearer ${access}`);
  const refresh = (rt: string) => http().post("/auth/refresh").send({ refreshToken: rt });
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  function lastOtpCode(): string {
    const m = wa.sent[wa.sent.length - 1]?.message.match(/(\d{4})/);
    if (!m) throw new Error("tidak ada OTP terkirim");
    return m[1];
  }

  async function verifiedToken(phone: string, purpose: "REGISTER" | "RESET_PASSWORD") {
    const rq = await http().post("/auth/otp/request").send({ phone, purpose });
    expect(rq.status).toBe(201);
    const rv = await http().post("/auth/otp/verify").send({ phone, code: lastOtpCode(), purpose });
    expect(rv.status).toBe(201);
    return data(rv).verificationToken as string;
  }

  // ======================================================= registrasi publik
  describe("registrasi publik", () => {
    it.each([UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.ADMIN_OUTLET, UserRole.CASHIER])(
      "role %s lewat /auth/register → 403, tidak ada user dibuat",
      async (role) => {
        const r = await http()
          .post("/auth/register")
          .send({ name: "Penyusup", email: "evil@uji.test", password: PASSWORD, role });
        expect(r.status).toBe(403);
        expect(await prisma.user.count()).toBe(0);
      },
    );

    it("alur OTP → register: nomor disimpan kanonik 628…, format apa pun diterima; sesi dibuat", async () => {
      const token = await verifiedToken("0812-3456-7890", "REGISTER");
      expect(wa.sent[0].phone).toBe("6281234567890");
      const r = await http().post("/auth/register").send({
        name: "Pelanggan Baru",
        phone: "+62 812 3456 7890",
        password: PASSWORD,
        verificationToken: token,
      });
      expect(r.status).toBe(201);
      const body = data(r);
      expect(body.user.phone).toBe("6281234567890");
      expect(body.user.passwordHash).toBeUndefined();
      expect(body.user.failedLoginAttempts).toBeUndefined();
      expect((await me(body.accessToken)).status).toBe(200);
      expect(await prisma.authSession.count()).toBe(1);
      expect(await prisma.customer.count()).toBe(1);
    });

    it("5 registrasi paralel untuk nomor yang sama → tepat satu akun (sisanya 409, bukan 500)", async () => {
      const token = await verifiedToken("081200000001", "REGISTER");
      const rs = await Promise.all(
        Array.from({ length: 5 }, () =>
          http().post("/auth/register").send({
            name: "Paralel",
            phone: "081200000001",
            password: PASSWORD,
            verificationToken: token,
          }),
        ),
      );
      const codes = rs.map((r) => r.status).sort();
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(4);
      expect(await prisma.user.count()).toBe(1);
      expect(await prisma.customer.count()).toBe(1);
    });
  });

  // ================================================ normalisasi nomor (T6)
  describe("normalisasi nomor HP (T6)", () => {
    it("akun lama bernomor 08… bisa login dengan +62…, 62…, 0… berspasi", async () => {
      await user({ phone: "081234567890" });
      for (const id of ["+6281234567890", "6281234567890", "0812 3456 7890", "081234567890"]) {
        expect((await login(id)).status).toBe(201);
      }
      expect((await login("+6281234567890", "salah-sekali")).status).toBe(401);
    });

    it("OTP REGISTER untuk nomor yang sudah terdaftar dalam format lain → 409", async () => {
      await user({ phone: "+6281234567891" });
      const r = await http().post("/auth/otp/request").send({ phone: "081234567891", purpose: "REGISTER" });
      expect(r.status).toBe(409);
      expect(wa.sent).toHaveLength(0);
    });

    it("nomor tidak valid → 400", async () => {
      const r = await http().post("/auth/otp/request").send({ phone: "12345678", purpose: "REGISTER" });
      expect(r.status).toBe(400);
    });

    it("dua akun lama untuk nomor yang sama (format berbeda): login hanya berhasil untuk password yang cocok tepat satu", async () => {
      await user({ phone: "081299990000", password: "PasswordA1" });
      await user({ phone: "6281299990000", password: "PasswordB1" });
      expect((await login("081299990000", "PasswordA1")).status).toBe(201);
      expect((await login("+6281299990000", "PasswordB1")).status).toBe(201);
    });
  });

  // ====================================================== penguncian login
  describe("penguncian login per akun", () => {
    it("10× salah → terkunci (429); password benar saat terkunci ditolak; setelah kunci habis → sukses & penghitung reset", async () => {
      const u = await user({ phone: "081211110000" });
      const codes: number[] = [];
      for (let i = 0; i < 10; i++) codes.push((await login("081211110000", "salah-salah")).status);
      expect(codes.slice(0, 9).every((c) => c === 401)).toBe(true);
      expect(codes[9]).toBe(429);
      expect((await login("081211110000")).status).toBe(429);

      await prisma.user.update({ where: { id: u.id }, data: { loginLockedUntil: new Date(Date.now() - 1000) } });
      expect((await login("081211110000")).status).toBe(201);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
      expect(after.failedLoginAttempts).toBe(0);
      expect(after.loginLockedUntil).toBeNull();
    });

    it("20 tebakan PARALEL → tepat 9×401 lalu terkunci (11×429); tebakan tidak lolos tanpa dihitung", async () => {
      await user({ phone: "081211110001" });
      const rs = await Promise.all(
        Array.from({ length: 20 }, () => login("081211110001", "salah-salah")),
      );
      const c401 = rs.filter((r) => r.status === 401).length;
      const c429 = rs.filter((r) => r.status === 429).length;
      expect(c401).toBe(9);
      expect(c429).toBe(11);
    });

    it("password benar diselipkan di banjir tebakan paralel tidak membuka kunci", async () => {
      await user({ phone: "081211110002" });
      for (let i = 0; i < 10; i++) await login("081211110002", "salah-salah");
      const rs = await Promise.all([
        ...Array.from({ length: 5 }, () => login("081211110002", "salah-salah")),
        login("081211110002"),
      ]);
      expect(rs.every((r) => r.status === 429)).toBe(true);
    });

    it("user tidak dikenal → 401 dengan pesan yang sama", async () => {
      await user({ phone: "081211110003" });
      const a = await login("081299999999", "salah-salah");
      const b = await login("081211110003", "salah-salah");
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });
  });

  // ======================================================= refresh token
  describe("rotasi refresh token", () => {
    it("login paralel (5×) → 5 sesi & token berbeda, tanpa 500 (jti acak)", async () => {
      await user({ phone: "081222220000" });
      const rs = await Promise.all(Array.from({ length: 5 }, () => login("081222220000")));
      expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
      const rts = new Set(rs.map((r) => data(r).refreshToken));
      expect(rts.size).toBe(5);
      expect(await prisma.authSession.count()).toBe(5);
    });

    it("refresh menghasilkan pasangan baru pada sesi yang sama; token lama dipakai lagi dalam masa tenggang → 401 tanpa mencabut sesi", async () => {
      await user({ phone: "081222220001" });
      const t0 = await loginOk("081222220001");
      const r1 = await refresh(t0.refreshToken);
      expect(r1.status).toBe(201);
      const t1 = data(r1);
      expect(jwt.decode(t1.accessToken)!["sid"]).toBe(jwt.decode(t0.accessToken)!["sid"]);

      const again = await refresh(t0.refreshToken);
      expect(again.status).toBe(401);
      expect((await me(t1.accessToken)).status).toBe(200);
      expect((await refresh(t1.refreshToken)).status).toBe(201);
    });

    it("8 refresh PARALEL dengan token yang sama → tepat satu berhasil; sesi tetap hidup", async () => {
      await user({ phone: "081222220002" });
      const t0 = await loginOk("081222220002");
      const rs = await Promise.all(Array.from({ length: 8 }, () => refresh(t0.refreshToken)));
      const ok = rs.filter((r) => r.status === 201);
      expect(ok).toHaveLength(1);
      expect(rs.filter((r) => r.status === 401)).toHaveLength(7);
      expect((await me(data(ok[0]).accessToken)).status).toBe(200);
      const sessionId = jwt.decode(t0.accessToken)!["sid"];
      const active = await prisma.refreshToken.count({ where: { sessionId, revokedAt: null } });
      expect(active).toBe(1);
    });

    it("token yang sudah dirotasi dipakai lagi SETELAH masa tenggang → seluruh sesi dicabut (pemegang token baru ikut keluar) + audit", async () => {
      env.AUTH_REFRESH_REUSE_GRACE_SECONDS = "0";
      await user({ phone: "081222220003" });
      const t0 = await loginOk("081222220003");
      const t1 = data(await refresh(t0.refreshToken));
      await new Promise((r) => setTimeout(r, 20));

      expect((await refresh(t0.refreshToken)).status).toBe(401); // pencuri / replay
      expect((await me(t1.accessToken)).status).toBe(401);
      expect((await refresh(t1.refreshToken)).status).toBe(401);
      const sid = jwt.decode(t0.accessToken)!["sid"];
      const s = await prisma.authSession.findUniqueOrThrow({ where: { id: sid } });
      expect(s.revokedReason).toBe("REFRESH_REUSE_DETECTED");
      expect(await prisma.auditLog.count({ where: { action: "AUTH_REFRESH_REUSE_DETECTED" } })).toBe(1);
    });

    it("refresh token lama (sebelum Batch 5, tanpa sesi) tetap bisa dirotasi dan dipindah ke sesi baru", async () => {
      const u = await user({ phone: "081222220004" });
      const legacy = jwt.sign(
        { sub: u.id, email: null, role: u.role },
        { secret: REFRESH_SECRET, expiresIn: "7d" },
      );
      await prisma.refreshToken.create({
        data: {
          userId: u.id,
          tokenHash: require("crypto").createHash("sha256").update(legacy).digest("hex"),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
      const r = await refresh(legacy);
      expect(r.status).toBe(201);
      const sid = jwt.decode(data(r).accessToken)!["sid"];
      expect(sid).toBeTruthy();
      expect((await me(data(r).accessToken)).status).toBe(200);
      expect(await prisma.authSession.count({ where: { userId: u.id } })).toBe(1);
    });

    it("refresh token milik user lain / tanda tangan palsu → 401", async () => {
      await user({ phone: "081222220005" });
      const forged = jwt.sign({ sub: "x" }, { secret: "salah" });
      expect((await refresh(forged)).status).toBe(401);
      expect((await refresh("bukan-jwt")).status).toBe(401);
    });
  });

  // ================================================ pencabutan sesi seketika
  describe("pencabutan sesi berlaku seketika untuk access token", () => {
    it("logout dengan refresh token → access token sesi itu langsung 401; sesi lain tidak terpengaruh", async () => {
      await user({ phone: "081233330000" });
      const a = await loginOk("081233330000");
      const b = await loginOk("081233330000");
      const r = await http().post("/auth/logout").set(bearer(a.accessToken)).send({ refreshToken: a.refreshToken });
      expect(r.status).toBe(201);
      expect((await me(a.accessToken)).status).toBe(401);
      expect((await refresh(a.refreshToken)).status).toBe(401);
      expect((await me(b.accessToken)).status).toBe(200);
    });

    it("logout tidak bisa mencabut sesi orang lain lewat refresh token curian", async () => {
      await user({ phone: "081233330001" });
      await user({ phone: "081233330002" });
      const victim = await loginOk("081233330001");
      const attacker = await loginOk("081233330002");
      await http().post("/auth/logout").set(bearer(attacker.accessToken)).send({ refreshToken: victim.refreshToken });
      expect((await me(victim.accessToken)).status).toBe(200);
    });

    it("logout-all → semua sesi keluar", async () => {
      await user({ phone: "081233330003" });
      const a = await loginOk("081233330003");
      const b = await loginOk("081233330003");
      expect((await http().post("/auth/logout-all").set(bearer(a.accessToken))).status).toBe(201);
      expect((await me(a.accessToken)).status).toBe(401);
      expect((await me(b.accessToken)).status).toBe(401);
      expect((await refresh(b.refreshToken)).status).toBe(401);
    });

    it("daftar sesi milik sendiri (+ penanda sesi ini); cabut sesi lain; sesi orang lain → 404", async () => {
      await user({ phone: "081233330004" });
      await user({ phone: "081233330005" });
      const a = await loginOk("081233330004");
      const b = await loginOk("081233330004");
      const other = await loginOk("081233330005");

      const list = data(await http().get("/auth/sessions").set(bearer(a.accessToken)));
      expect(list).toHaveLength(2);
      const current = list.find((s: any) => s.current);
      expect(current.id).toBe(jwt.decode(a.accessToken)!["sid"]);

      const otherSid = jwt.decode(other.accessToken)!["sid"];
      expect((await http().delete(`/auth/sessions/${otherSid}`).set(bearer(a.accessToken))).status).toBe(404);
      expect((await me(other.accessToken)).status).toBe(200);

      const bSid = jwt.decode(b.accessToken)!["sid"];
      expect((await http().delete(`/auth/sessions/${bSid}`).set(bearer(a.accessToken))).status).toBe(200);
      expect((await me(b.accessToken)).status).toBe(401);
      expect((await me(a.accessToken)).status).toBe(200);
    });

    it("admin menonaktifkan akun → access & refresh token user langsung ditolak; aktif lagi tetap harus login ulang", async () => {
      const admin = await user({ phone: "081233330006", role: UserRole.SUPER_ADMIN });
      const target = await user({ phone: "081233330007" });
      const adm = await loginOk("081233330006");
      const t = await loginOk("081233330007");

      const off = await http().patch(`/users/${target.id}`).set(bearer(adm.accessToken)).send({ isActive: false });
      expect(off.status).toBe(200);
      expect((await me(t.accessToken)).status).toBe(401);
      expect((await refresh(t.refreshToken)).status).toBe(401);
      expect((await login("081233330007")).status).toBe(401);

      await http().patch(`/users/${target.id}`).set(bearer(adm.accessToken)).send({ isActive: true });
      expect((await me(t.accessToken)).status).toBe(401);
      expect((await refresh(t.refreshToken)).status).toBe(401);
      expect((await login("081233330007")).status).toBe(201);
      expect(admin.id).toBeTruthy();
    });

    it("admin mengganti password atau role user → semua sesi user dicabut", async () => {
      await user({ phone: "081233330008", role: UserRole.SUPER_ADMIN });
      const target = await user({ phone: "081233330009", role: UserRole.CASHIER });
      const adm = await loginOk("081233330008");

      const t1 = await loginOk("081233330009");
      await http().patch(`/users/${target.id}`).set(bearer(adm.accessToken)).send({ role: UserRole.OPERATOR });
      expect((await me(t1.accessToken)).status).toBe(401);

      const t2 = await loginOk("081233330009");
      await http().patch(`/users/${target.id}`).set(bearer(adm.accessToken)).send({ password: "PasswordBaru9" });
      expect((await me(t2.accessToken)).status).toBe(401);
      expect((await login("081233330009", "PasswordBaru9")).status).toBe(201);
    });

    it("access token lama tanpa sesi: ditolak bila user nonaktif atau password diubah setelah token terbit", async () => {
      const u = await user({ phone: "081233330010" });
      const legacy = jwt.sign({ sub: u.id, email: null, role: u.role }, { secret: ACCESS_SECRET, expiresIn: "15m" });
      expect((await me(legacy)).status).toBe(200);
      await new Promise((r) => setTimeout(r, 1100));
      await prisma.user.update({ where: { id: u.id }, data: { passwordChangedAt: new Date() } });
      expect((await me(legacy)).status).toBe(401);

      const u2 = await user({ phone: "081233330011" });
      const legacy2 = jwt.sign({ sub: u2.id, role: u2.role }, { secret: ACCESS_SECRET, expiresIn: "15m" });
      await prisma.user.update({ where: { id: u2.id }, data: { isActive: false } });
      expect((await me(legacy2)).status).toBe(401);
    });

    it("role diambil dari database, bukan dari isi token", async () => {
      const u = await user({ phone: "081233330012" });
      const lying = jwt.sign({ sub: u.id, role: UserRole.SUPER_ADMIN }, { secret: ACCESS_SECRET, expiresIn: "15m" });
      const r = await http().get("/users").set(bearer(lying));
      expect(r.status).toBe(403);
    });
  });

  // ================================================== ganti & reset password
  describe("ganti password & reset password", () => {
    it("ganti password: password lama salah → 400; benar → sesi lain keluar, sesi ini tetap; password lama tidak berlaku", async () => {
      await user({ phone: "081244440000" });
      const a = await loginOk("081244440000");
      const b = await loginOk("081244440000");

      const bad = await http().post("/auth/password/change").set(bearer(a.accessToken))
        .send({ currentPassword: "salah-salah", newPassword: "PasswordBaru1" });
      expect(bad.status).toBe(400);

      const same = await http().post("/auth/password/change").set(bearer(a.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD });
      expect(same.status).toBe(400);

      const ok = await http().post("/auth/password/change").set(bearer(a.accessToken))
        .send({ currentPassword: PASSWORD, newPassword: "PasswordBaru1" });
      expect(ok.status).toBe(201);
      expect(data(ok).revokedSessions).toBe(1);
      expect((await me(a.accessToken)).status).toBe(200);
      expect((await refresh(a.refreshToken)).status).toBe(201);
      expect((await me(b.accessToken)).status).toBe(401);
      expect((await login("081244440000")).status).toBe(401);
      expect((await login("081244440000", "PasswordBaru1")).status).toBe(201);
    });

    it("ganti password ikut penguncian login (tidak bisa dipakai untuk menebak)", async () => {
      await user({ phone: "081244440001" });
      const a = await loginOk("081244440001");
      const codes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const r = await http().post("/auth/password/change").set(bearer(a.accessToken))
          .send({ currentPassword: `salah-${i}xx`, newPassword: "PasswordBaru1" });
        codes.push(r.status);
      }
      expect(codes[9]).toBe(429);
      expect((await login("081244440001")).status).toBe(429);
    });

    it("reset password via OTP: semua sesi keluar, kunci login dibuka, token verifikasi tidak bisa dipakai dua kali", async () => {
      const u = await user({ phone: "081244440002" });
      const s = await loginOk("081244440002");
      await prisma.user.update({ where: { id: u.id }, data: { loginLockedUntil: new Date(Date.now() + 600_000) } });

      await new Promise((r) => setTimeout(r, 1100)); // iat token verifikasi > passwordChangedAt awal
      const token = await verifiedToken("+6281244440002", "RESET_PASSWORD");
      const r1 = await http().post("/auth/password/reset")
        .send({ phone: "0812-4444-0002", newPassword: "PasswordBaru2", verificationToken: token });
      expect(r1.status).toBe(201);
      expect((await me(s.accessToken)).status).toBe(401);
      expect((await refresh(s.refreshToken)).status).toBe(401);
      expect((await login("081244440002", "PasswordBaru2")).status).toBe(201);

      const r2 = await http().post("/auth/password/reset")
        .send({ phone: "081244440002", newPassword: "PasswordBaru3", verificationToken: token });
      expect(r2.status).toBe(400);
      expect((await login("081244440002", "PasswordBaru2")).status).toBe(201);
    });
  });

  // ============================================================ OTP (T7)
  describe("OTP WhatsApp (T7)", () => {
    it("production tanpa WA_API_KEY → 503, tidak ada kode dibuat", async () => {
      wa.configured = false;
      wa.devAllowed = false;
      const r = await http().post("/auth/otp/request").send({ phone: "081255550000", purpose: "REGISTER" });
      expect(r.status).toBe(503);
      expect(await prisma.otpCode.count()).toBe(0);
    });

    it("pengiriman gagal → 503 dengan pesan jelas; kode dihapus & tidak menghabiskan kuota", async () => {
      wa.fail = true;
      for (let i = 0; i < 4; i++) {
        const r = await http().post("/auth/otp/request").send({ phone: "081255550001", purpose: "REGISTER" });
        expect(r.status).toBe(503);
        expect(r.body.message).toMatch(/Gagal mengirim OTP/);
      }
      expect(await prisma.otpCode.count()).toBe(0);
      wa.fail = false;
      const ok = await http().post("/auth/otp/request").send({ phone: "081255550001", purpose: "REGISTER" });
      expect(ok.status).toBe(201);
      expect(JSON.stringify(ok.body)).not.toContain(lastOtpCode());
    });

    it("10 tebakan OTP PARALEL → hanya 5 dihitung; kode benar sesudahnya ditolak", async () => {
      await http().post("/auth/otp/request").send({ phone: "081255550002", purpose: "REGISTER" });
      const code = lastOtpCode();
      const wrong = code === "0000" ? "1111" : "0000";
      const rs = await Promise.all(
        Array.from({ length: 10 }, () =>
          http().post("/auth/otp/verify").send({ phone: "081255550002", code: wrong, purpose: "REGISTER" }),
        ),
      );
      expect(rs.filter((r) => r.body.message === "Kode OTP salah")).toHaveLength(5);
      const otp = await prisma.otpCode.findFirstOrThrow();
      expect(otp.attempts).toBe(5);
      const late = await http().post("/auth/otp/verify").send({ phone: "081255550002", code, purpose: "REGISTER" });
      expect(late.status).toBe(401);
    });

    it("kode benar diverifikasi PARALEL → tepat satu token verifikasi", async () => {
      await http().post("/auth/otp/request").send({ phone: "081255550003", purpose: "REGISTER" });
      const code = lastOtpCode();
      const rs = await Promise.all(
        Array.from({ length: 5 }, () =>
          http().post("/auth/otp/verify").send({ phone: "081255550003", code, purpose: "REGISTER" }),
        ),
      );
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    });
  });
});
