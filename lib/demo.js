"use strict";
// Chế độ trình diễn: phi hành đoàn giả lập để xem trạm khi chưa có phiên Claude Code nào (npm run demo).
const { dayKey, hash, clip } = require("./util");
const { getLang } = require("./i18n");

// Nội dung giả lập theo ngôn ngữ máy chủ ("lang" trong config.json hoặc ORBIT_LANG=en).
const CONTENT = {
  vi: (() => {
const CREW = [
  { name: "ORION", title: "API thanh toán", project: "shop-api", branch: "feat/payments-v2", model: "claude-opus-4-5", role: "Backend" },
  { name: "VEGA", title: "Lịch đặt lịch hẹn", project: "booking-web", branch: "feat/class-calendar", model: "claude-sonnet-4-5", role: "Frontend" },
  { name: "LYRA", title: "Review PR #482", project: "shop-web", branch: "review/pr-482", model: "claude-sonnet-4-5", role: "Kiểm duyệt" },
  { name: "ATLAS", title: "Terraform môi trường staging", project: "infra-aws", branch: "chore/staging-ecs", model: "claude-opus-4-5", role: "Hạ tầng" },
  { name: "NOVA", title: "Kiểm thử E2E onboarding", project: "mobile-app", branch: "test/e2e-onboarding", model: "claude-haiku-4-5", role: "QA" },
  { name: "KEPLER", title: "Bộ bài tập toán lớp 3", project: "math-quiz", branch: "feat/quiz-set-3", model: "claude-sonnet-4-5", role: "Nội dung" },
  { name: "IRIS", title: "Tài liệu OpenAPI", project: "shop-api", branch: "docs/openapi", model: "claude-haiku-4-5", role: "Tài liệu" },
];
const TOOLS = [
  ["Read", "src/routes/payments.ts"], ["Edit", "PaymentService.ts"], ["Bash", "Chạy unit test thanh toán"], ["Grep", "stripeCustomerId"],
  ["Bash", "npm run lint"], ["Edit", "CalendarGrid.tsx"], ["Read", "booking.schema.prisma"], ["Bash", "terraform plan -target=module.ecs"],
  ["Write", "staging.tfvars"], ["Bash", "pnpm playwright test onboarding"], ["WebFetch", "docs.stripe.com"], ["Glob", "**/*.spec.ts"],
  ["Task", "Rà soát lỗi bảo mật"], ["Edit", "openapi.yaml"], ["Bash", "git diff --stat"], ["Read", "README.md"], ["TodoWrite", "5 việc"],
];
const PROMPTS = [
  "Thêm webhook hoàn tiền cho Stripe, nhớ viết test", "Lịch tuần phải cuộn ngang mượt trên iPhone SE", "Review giúp PR #482, chú ý phần phân quyền",
  "Dựng ECS service cho staging theo branch", "Viết test E2E cho luồng onboarding", "Soạn 20 câu toán lớp 3 chủ đề quy luật dãy số",
  "Cập nhật tài liệu OpenAPI cho endpoint /refunds",
];
const REPLIES = [
  "Đã thêm webhook refund.created, 14 test đều qua.", "Lịch đã cuộn mượt, đã kiểm trên 3 kích thước màn hình.", "PR #482 có 2 chỗ cần sửa ở middleware phân quyền.",
  "Plan xong: 6 tài nguyên mới, không xoá gì.", "8/9 kịch bản E2E qua, 1 cái chờ dữ liệu mẫu.", "Xong 20 câu, đã gắn độ khó và lời giải.", "Đã cập nhật schema và ví dụ cho /refunds.",
];
const SUB_TYPES = [["Explore", "Tìm chỗ gọi API thanh toán"], ["general-purpose", "Viết test cho webhook"], ["code-reviewer", "Rà soát lỗi bảo mật"], ["Plan", "Lập kế hoạch migrate DB"], ["Explore", "Đọc cấu hình Terraform"]];
const ASKS = ["@plan", "Cho phép chạy terraform apply trên staging?", "Dùng Stripe test mode hay sandbox mới?"];
const MSGS = [
  ["ORION", "IRIS", "Endpoint /refunds đã xong, cập nhật tài liệu giúp nhé"], ["LYRA", "ORION", "PR #482: sửa kiểm tra role ở middleware"],
  ["ATLAS", "NOVA", "Staging branch test/e2e-onboarding đã lên"], ["NOVA", "VEGA", "Nút 'Đặt lớp' bị che trên màn nhỏ"],
];

const BG = { ORION: [["npm run dev", "Chạy dev server", ["▲ Next.js 15.0.3", "- Local: http://localhost:3000", "✓ Ready in 1.8s"]]],
  ATLAS: [["terraform apply -auto-approve -target=module.ecs", "Apply ECS staging", ["module.ecs.aws_ecs_service.api: Modifying...", "module.ecs.aws_ecs_service.api: Still modifying... [10s elapsed]"]], ["tail -f /var/log/deploy.log", "Theo dõi log deploy", ["[deploy] pulling image shop-api:4f2a1c", "[deploy] health check 1/3 ok"]]],
  NOVA: [["pnpm playwright test onboarding", "E2E onboarding", ["Running 9 tests using 3 workers", "✓ 8 passed", "✘ 1 failed: onboarding › chọn gói"]]] };
const SUB_REPLIES = ["Tìm thấy 3 chỗ cần sửa trong PaymentService.", "Đã viết 6 test, tất cả qua.", "Không thấy lỗ hổng nghiêm trọng, 2 cảnh báo nhỏ.", "Kế hoạch 4 bước, ước 2 giờ."];
const SUB_DONE = "xong";
return { CREW, TOOLS, PROMPTS, REPLIES, SUB_TYPES, ASKS, MSGS, BG, SUB_REPLIES, SUB_DONE };
})(),
  en: (() => {
const CREW = [
  { name: "ORION", title: "Payments API", project: "shop-api", branch: "feat/payments-v2", model: "claude-opus-4-5", role: "Backend" },
  { name: "VEGA", title: "Booking calendar", project: "booking-web", branch: "feat/class-calendar", model: "claude-sonnet-4-5", role: "Frontend" },
  { name: "LYRA", title: "Review PR #482", project: "shop-web", branch: "review/pr-482", model: "claude-sonnet-4-5", role: "Reviewer" },
  { name: "ATLAS", title: "Terraform staging environment", project: "infra-aws", branch: "chore/staging-ecs", model: "claude-opus-4-5", role: "Infra" },
  { name: "NOVA", title: "Onboarding E2E tests", project: "mobile-app", branch: "test/e2e-onboarding", model: "claude-haiku-4-5", role: "QA" },
  { name: "KEPLER", title: "Grade 3 math quiz set", project: "math-quiz", branch: "feat/quiz-set-3", model: "claude-sonnet-4-5", role: "Content" },
  { name: "IRIS", title: "OpenAPI docs", project: "shop-api", branch: "docs/openapi", model: "claude-haiku-4-5", role: "Docs" },
];
const TOOLS = [
  ["Read", "src/routes/payments.ts"], ["Edit", "PaymentService.ts"], ["Bash", "Run payment unit tests"], ["Grep", "stripeCustomerId"],
  ["Bash", "npm run lint"], ["Edit", "CalendarGrid.tsx"], ["Read", "booking.schema.prisma"], ["Bash", "terraform plan -target=module.ecs"],
  ["Write", "staging.tfvars"], ["Bash", "pnpm playwright test onboarding"], ["WebFetch", "docs.stripe.com"], ["Glob", "**/*.spec.ts"],
  ["Task", "Security review"], ["Edit", "openapi.yaml"], ["Bash", "git diff --stat"], ["Read", "README.md"], ["TodoWrite", "5 todos"],
];
const PROMPTS = [
  "Add a Stripe refund webhook, with tests", "The week view must scroll smoothly on an iPhone SE", "Please review PR #482, focus on the permission checks",
  "Set up the staging ECS service per branch", "Write E2E tests for the onboarding flow", "Write 20 grade-3 math questions about number patterns",
  "Update the OpenAPI docs for the /refunds endpoint",
];
const REPLIES = [
  "Added the refund.created webhook, all 14 tests pass.", "The calendar scrolls smoothly now, checked on 3 screen sizes.", "PR #482 needs 2 fixes in the permission middleware.",
  "Plan done: 6 new resources, nothing destroyed.", "8/9 E2E scenarios pass, 1 is waiting on seed data.", "Done: 20 questions with difficulty and worked answers.", "Updated the schema and examples for /refunds.",
];
const SUB_TYPES = [["Explore", "Find payment API call sites"], ["general-purpose", "Write webhook tests"], ["code-reviewer", "Security review"], ["Plan", "Plan the DB migration"], ["Explore", "Read the Terraform config"]];
const ASKS = ["@plan", "Allow terraform apply on staging?", "Use Stripe test mode or the new sandbox?"];
const MSGS = [
  ["ORION", "IRIS", "/refunds is done, please update the docs"], ["LYRA", "ORION", "PR #482: fix the role check in the middleware"],
  ["ATLAS", "NOVA", "Staging for test/e2e-onboarding is up"], ["NOVA", "VEGA", "The 'Book class' button is hidden on small screens"],
];
const BG = { ORION: [["npm run dev", "Dev server", ["▲ Next.js 15.0.3", "- Local: http://localhost:3000", "✓ Ready in 1.8s"]]],
  ATLAS: [["terraform apply -auto-approve -target=module.ecs", "Apply ECS staging", ["module.ecs.aws_ecs_service.api: Modifying...", "module.ecs.aws_ecs_service.api: Still modifying... [10s elapsed]"]], ["tail -f /var/log/deploy.log", "Watch deploy log", ["[deploy] pulling image shop-api:4f2a1c", "[deploy] health check 1/3 ok"]]],
  NOVA: [["pnpm playwright test onboarding", "E2E onboarding", ["Running 9 tests using 3 workers", "✓ 8 passed", "✘ 1 failed: onboarding › choose plan"]]] };
const SUB_REPLIES = ["Found 3 places to fix in PaymentService.", "Wrote 6 tests, all passing.", "No serious vulnerabilities, 2 minor warnings.", "4-step plan, about 2 hours."];
const SUB_DONE = "done";
return { CREW, TOOLS, PROMPTS, REPLIES, SUB_TYPES, ASKS, MSGS, BG, SUB_REPLIES, SUB_DONE };
})(),
};
const { CREW, TOOLS, PROMPTS, REPLIES, SUB_TYPES, ASKS, MSGS, BG, SUB_REPLIES, SUB_DONE } = CONTENT[getLang()] || CONTENT.en;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

class Demo {
  constructor(cfg, inbox) {
    this.cfg = cfg; this.inbox = inbox;
    this.agents = new Map(); this.events = []; this.evSeq = 0; this.hooksLastAt = Date.now();
    const now = Date.now();
    const start = ["working", "working", "ask", "working", "done", "working", "idle"];
    CREW.forEach((c, i) => {
      const id = (hash(c.name).toString(16).padStart(8, "0") + "-demo-4" + String(i).padStart(3, "0") + "-a" + "000-" + "000000000000").slice(0, 36);
      const a = {
        ...c, id, short: id.slice(0, 8), slot: i, hue: (i * 51 + 190) % 360, status: start[i], turnOpen: start[i] === "working", endAt: 0,
        startedAt: now - rnd(20, 240) * 60e3, lastActivity: now - (start[i] === "idle" ? 45 * 60e3 : rnd(5, 60) * 1000),
        lastPrompt: PROMPTS[i], promptAt: now - rnd(2, 30) * 60e3, lastText: REPLIES[i], lastTextAt: now - rnd(1, 20) * 60e3,
        tool: null, toolFeed: [], subagents: 0, ask: start[i] === "ask" ? ASKS[0] : null,
        tokens: { in: 0, out: 0, cr: 0, cw: 0 }, cost: rnd(0.4, 6), tools: Math.floor(rnd(20, 160)), errors: Math.floor(rnd(0, 6)), turns: Math.floor(rnd(3, 20)),
        mins: new Map(), next: now + rnd(2, 8) * 1000, order: null, subs: [], bg: [],
      };
      a.tokens.in = Math.floor(rnd(2e3, 9e3)); a.tokens.out = Math.floor(rnd(2e4, 9e4)); a.tokens.cr = Math.floor(rnd(1e6, 9e6)); a.tokens.cw = Math.floor(rnd(1e5, 6e5));
      const m0 = Math.floor(now / 60e3);
      for (let k = 0; k < 60; k++) if (Math.random() < (start[i] === "idle" ? 0.1 : 0.7)) a.mins.set(m0 - k, Math.floor(rnd(1, 9)));
      for (let k = 0; k < 6; k++) { const [n, s] = pick(TOOLS); a.toolFeed.push({ t: now - (6 - k) * rnd(20, 60) * 1000, name: n, summary: s, err: Math.random() < 0.08 }); }
      if (a.status === "working") a.tool = { ...a.toolFeed[a.toolFeed.length - 1], t: now };
      this.agents.set(id, a);
    });
    for (const a of this.agents.values()) if (a.name === "ATLAS" || a.name === "ORION") { this.spawnSub(a, now - 20e3); this.spawnSub(a, now - 5e3); }
    for (const a of this.agents.values()) for (const [command, description, lines] of BG[a.name] || []) {
      const failed = a.name === "NOVA";
      a.bg.push({ id: "b" + Math.random().toString(36).slice(2, 8), command, description, how: "tool", status: failed ? "failed" : "running", exitCode: failed ? 1 : null,
        startedAt: now - rnd(3, 30) * 60e3, endedAt: failed ? now - 20e3 : 0, outputPath: `/private/tmp/claude-501/-Users-demo-Work-${a.project}/tasks/${Math.random().toString(36).slice(2, 8)}.output`,
        summary: "", tail: lines.slice(), outputSize: 4000, outputAt: now - 2000 });
    }
    this.events = [];
    this.byName = new Map([...this.agents.values()].map((a) => [a.name, a]));
    this.byName.get("VEGA").standby = { on: true, minutes: 30 };
    this.push({ t: now - 50e3, kind: "prompt", from: "commander", to: this.byName.get("ORION").id, text: PROMPTS[0] });
    this.push({ t: now - 30e3, kind: "msg", from: this.byName.get("LYRA").id, to: this.byName.get("ORION").id, text: MSGS[1][2] });
    this.push({ t: now - 12e3, kind: "ask", from: this.byName.get("VEGA").id, to: "commander", text: ASKS[0] });
  }

  spawnSub(a, now) {
    const [type, description] = pick(SUB_TYPES);
    const sub = { id: Math.random().toString(16).slice(2, 12), type, description, model: pick(["claude-haiku-4-5", "claude-sonnet-4-5"]), depth: 1, background: Math.random() < 0.3,
      status: "running", tool: null, tools: 0, errors: 0, tokens: 0, cost: 0, startedAt: now, endedAt: 0, lastActivity: now, lastText: "", hue: Math.floor(rnd(0, 360)), until: now + rnd(12, 40) * 1000 };
    a.subs.unshift(sub); if (a.subs.length > 8) a.subs.pop();
    this.pushEvent({ kind: "spawn", from: a.id, to: "sub:" + sub.id, text: `${type}: ${description}` });
  }
  tickSubs(a, now) {
    for (const x of a.subs) {
      if (x.status !== "running") continue;
      x.lastActivity = now; x.tokens += Math.floor(rnd(500, 4000)); x.cost += rnd(0.0005, 0.004);
      if (Math.random() < 0.3) { const [n, s] = pick(TOOLS.filter((t) => t[0] !== "Task")); x.tool = { name: n, summary: s, t: now }; x.tools++; }
      if (now > x.until) {
        x.status = "done"; x.tool = null; x.endedAt = now; x.lastText = pick(SUB_REPLIES);
        this.pushEvent({ kind: "subdone", from: "sub:" + x.id, to: a.id, text: `${x.type} ${SUB_DONE}: ${x.lastText}` });
      }
    }
  }

  push(e) { this.events.push({ id: ++this.evSeq, ...e }); if (this.events.length > 300) this.events.shift(); }
  pushEvent(e) { this.push({ t: Date.now(), ...e }); }
  discover() {}
  onHook() {}

  tick() {
    const now = Date.now();
    this.hooksLastAt = now;
    for (const a of this.agents.values()) {
      this.tickSubs(a, now);
      for (const x of a.bg) if (x.status === "running" && Math.random() < 0.25) {
        x.tail.push(pick(["GET /api/payments 200 18ms", "POST /api/refunds 201 42ms", "[deploy] health check ok", "Still modifying... [" + Math.floor((now - x.startedAt) / 1000) + "s elapsed]", "compiled successfully in 412ms"]));
        if (x.tail.length > 12) x.tail.shift(); x.outputAt = now; x.outputSize += 60;
      }
      if (a.status === "working") {
        a.lastActivity = now;
        const m = Math.floor(now / 60e3); if (Math.random() < 0.5) a.mins.set(m, (a.mins.get(m) || 0) + 1);
        a.tokens.out += Math.floor(rnd(20, 160)); a.tokens.cr += Math.floor(rnd(2e3, 2e4)); a.cost += rnd(0.001, 0.01);
        if (Math.random() < 0.25) {
          const [n, s] = pick(TOOLS); a.tool = { name: n, summary: s, t: now };
          a.toolFeed.push({ t: now, name: n, summary: s, err: Math.random() < 0.06 }); if (a.toolFeed.length > 14) a.toolFeed.shift(); a.tools++;
          if (n === "Task" && a.subs.filter((x) => x.status === "running").length < 3) this.spawnSub(a, now);
        }
      }
      if (now < a.next) continue;
      const r = Math.random();
      if (a.order && a.order.stage === "working") {
        this.inbox.markDone(a.order.id, pick(REPLIES), "demo"); a.order = null;
        a.status = "done"; a.turnOpen = false; a.tool = null; a.endAt = now; a.lastText = pick(REPLIES); a.turns++;
        a.next = now + rnd(15, 30) * 1000; continue;
      }
      switch (a.status) {
        case "working":
          if (r < 0.15) { a.status = "ask"; a.ask = pick(ASKS); a.tool = null; this.pushEvent({ kind: "ask", from: a.id, to: "commander", text: a.ask }); a.next = now + rnd(15, 30) * 1000; }
          else if (r < 0.45) { a.status = "done"; a.turnOpen = false; a.tool = null; a.lastText = pick(REPLIES); a.turns++; this.pushEvent({ kind: "reply", from: a.id, to: "commander", text: a.lastText }); a.next = now + rnd(10, 25) * 1000; }
          else if (r < 0.6) { const mm = MSGS.find((x) => x[0] === a.name) || pick(MSGS); const to = this.byName.get(mm[1]); if (to && to !== a) this.pushEvent({ kind: "msg", from: a.id, to: to.id, text: mm[2] }); a.next = now + rnd(5, 12) * 1000; }
          else a.next = now + rnd(5, 12) * 1000;
          break;
        case "ask":
          a.status = "working"; a.ask = null; a.next = now + rnd(8, 20) * 1000; break;
        case "done":
          if (r < 0.7) { a.status = "working"; a.turnOpen = true; a.lastPrompt = pick(PROMPTS); a.promptAt = now; this.pushEvent({ kind: "prompt", from: "commander", to: a.id, text: a.lastPrompt }); a.next = now + rnd(12, 30) * 1000; }
          else { a.status = "idle"; a.next = now + rnd(20, 40) * 1000; }
          break;
        case "idle":
          if (r < 0.5) { a.status = "working"; a.turnOpen = true; a.lastPrompt = pick(PROMPTS); a.promptAt = now; this.pushEvent({ kind: "prompt", from: "commander", to: a.id, text: a.lastPrompt }); }
          a.next = now + rnd(15, 30) * 1000; break;
      }
    }
    // lệnh thật gửi từ giao diện tới phi hành gia giả lập
    for (const m of this.inbox.read().msgs.values()) {
      const a = this.agents.get(m.to.id); if (!a) continue;
      if (m.status === "pending" && now - m.t > 2500) { this.inbox.markDelivered([m.id], "demo"); a.order = { id: m.id, stage: "working" }; a.status = "working"; a.ask = null; a.turnOpen = true; a.lastPrompt = clip(m.text, 300); a.promptAt = now; a.next = now + rnd(10, 16) * 1000; }
    }
  }

  snapshot() {
    const now = Date.now(), m0 = Math.floor(now / 60e3);
    const agents = [...this.agents.values()].map((a) => {
      const activity = []; for (let i = 59; i >= 0; i--) activity.push(a.mins.get(m0 - i) || 0);
      return {
        id: a.id, short: a.short, slot: a.slot, hue: a.hue, name: a.name, role: a.role, title: a.title, project: a.project, cwd: `~/Work/${a.project}`, branch: a.branch,
        model: a.model, version: "demo", status: a.status === "done" && a.standby ? "standby" : a.status, tool: a.status === "working" ? a.tool : null, ask: a.status === "ask" ? a.ask : null,
        lastPrompt: a.lastPrompt, promptAt: a.promptAt, lastText: a.lastText, lastTextAt: a.lastTextAt, lastActivity: a.lastActivity, startedAt: a.startedAt,
        subagents: a.subs.filter((x) => x.status === "running").length, bg: a.bg,
        subs: a.subs.filter((x) => x.status === "running" || now - x.endedAt < 20 * 60e3).map(({ until, ...x }) => ({ ...x, cost: +x.cost.toFixed(4) })),
        toolFeed: a.toolFeed.slice(-14),
        today: { tokens: a.tokens.in + a.tokens.out + a.tokens.cr + a.tokens.cw, in: a.tokens.in, out: a.tokens.out, cacheRead: a.tokens.cr, cacheWrite: a.tokens.cw, cost: +a.cost.toFixed(4), tools: a.tools, errors: a.errors, turns: a.turns },
        sessionCost: a.cost * 1.3, activity, viaHooks: true, standby: a.standby || null, standbyUntil: a.status === "done" && a.standby ? now + a.standby.minutes * 60e3 - 90e3 : 0,
      };
    });
    return { agents, events: this.events.slice(-120), hooksLastAt: this.hooksLastAt, commanderLast: null };
  }
}

module.exports = { Demo };
