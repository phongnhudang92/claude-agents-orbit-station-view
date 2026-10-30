"use strict";
// Ngôn ngữ phía máy chủ: lệnh gửi cho agent, thông báo lỗi, đầu ra terminal.
// "lang" trong config.json: "vi" | "en" | "auto" (theo ngôn ngữ hệ điều hành).

const DICT = {
  vi: {
    commander: "Chỉ huy", title: "Trạm Orbit",
    "order.header": "📡 TRẠM ORBIT — có {n} lệnh mới gửi tới phiên này:",
    "order.from": "[{id}] từ {from}:",
    "order.footer": "Hãy thực hiện lệnh trên như một yêu cầu bình thường của người dùng. Nếu có công cụ MCP \"orbit_done\", gọi nó với mã tin và một dòng kết quả khi làm xong.",
    "note.done": "Đã xong", "note.turnDone": "Đã xong lượt", "note.cancelled": "Đã hủy", "note.wakeFailed": "Đánh thức thất bại: {e}",
    "copy.name": "{n} ⧉", "copy.title": "Bản sao làm lệnh “{t}” · claude attach {id}", "session": "Phiên",
    "err.badRequest": "Yêu cầu không hợp lệ", "err.noAgent": "Không có phi hành gia này", "err.emptyText": "Lệnh trống hoặc dài quá 4000 ký tự",
    "err.cancelPending": "Chỉ hủy được lệnh chưa giao", "err.wakeOff": "Đánh thức phiên đang tắt — lệnh sẽ được giao qua hooks.",
    "err.working": "Phiên đang làm — lệnh sẽ tự được giao khi nó xong lượt (cần hooks)", "err.noPending": "Không có lệnh nào đang chờ giao",
    "err.noCwd": "Không biết thư mục làm việc của phiên này", "err.noClaude": "Không tìm thấy lệnh claude. Đặt \"claudePath\" trong config.json.",
    "err.claudeBroken": "Lệnh claude không chạy được: {e}", "err.findingClaude": "Đang tìm lệnh claude…",
    "err.badDir": "Thư mục không hợp lệ — nhập đường dẫn tuyệt đối tới một thư mục có thật", "err.badMode": "Cách mở không hợp lệ",
    "err.noDesktop": "Mở trong app Claude desktop chỉ hỗ trợ macOS — hãy chọn chạy nền",
    "err.noTerminal": "Mở cửa sổ Terminal chỉ hỗ trợ macOS — hãy chọn chạy nền", "err.noBg": "Bản Claude Code này chưa có --bg — hãy chọn Terminal",
    "err.needPrompt": "Chạy nền cần lệnh đầu tiên", "err.promptLong": "Lệnh dài quá 4000 ký tự", "err.demoLaunch": "Chế độ trình diễn không mở được phiên thật",
    "err.notFound": "Không có", "err.method": "Không hỗ trợ", "err.tooLong": "quá dài", "err.hookSecret": "Sai mã hook",
    "cfg.syntax": "config.json bị lỗi cú pháp: {e}",
    "con.portBusy": "Cổng {p} đang bận. Đổi \"port\" trong config.json hoặc chạy ORBIT_PORT=7800 npm start",
    "con.demo": " · CHẾ ĐỘ TRÌNH DIỄN", "con.open": "Mở:           ", "con.watch": "Theo dõi:     ", "con.all": "mọi dự án trong {d}",
    "con.crew": "Phi hành đoàn:", "con.crewN": "{n} phiên hoạt động trong {h} giờ qua",
    "mask.secret": "‹ẩn›", "mask.key": "‹khóa›", "mask.private": "‹khóa riêng›", "todo": "{n} việc",
    "hk.readFail": "Không đọc được {f}: {e}. Không sửa gì.", "hk.backup": "Đã sao lưu: {f}",
    "hk.installed": "✅ Đã cài hooks Trạm Orbit cho {n} sự kiện vào {f}", "hk.node": "Node dùng cho hook: {p}",
    "hk.newSessions": "Các phiên Claude Code mở MỚI sẽ có tín hiệu tức thời và nhận lệnh từ trạm.",
    "hk.openSessions": "Phiên đang mở: gõ /hooks trong phiên đó (hoặc mở lại) để nạp hooks.",
    "hk.removed": "Đã gỡ {n} hook của Trạm Orbit khỏi {f}", "hk.none": "Không có hook nào của Trạm Orbit để gỡ.",
    "hk.file": "File: {f}", "hk.for": "Đã cài cho: {e}", "hk.missing": "Chưa cài hooks Trạm Orbit (npm run hooks:install).",
    "hk.stale": "⚠️  Hook đang trỏ tới bản Node khác — chạy lại npm run hooks:install nếu đã đổi phiên bản Node.",
    "mi.run": "Chạy: {c}", "mi.noClaude": "Không tìm thấy lệnh `claude` trong PATH. Chạy tay dòng trên trong Terminal.",
    "mcp.noSession": "Không xác định được phiên hiện tại. Truyền tham số session (8 ký tự đầu mã phiên, xem trên trạm).",
    "mcp.empty": "Hòm thư trống (phiên {s}).", "mcp.noOrder": "Không có lệnh {id}.", "mcp.marked": "Đã đánh dấu xong {id}.",
    "mcp.offline": "Trạm Orbit chưa chạy (npm start).", "mcp.noRecipient": "Không có ai tên \"{n}\". Đang có: {list}",
    "mcp.sent": "Đã gửi {id} tới {n}. Tin sẽ được giao khi {n} xong lượt hiện tại.", "mcp.reported": "Đã gửi báo cáo về đài chỉ huy.",
    "mcp.emptyStation": "Trạm đang trống.", "mcp.noTool": "Không có công cụ {n}", "mcp.error": "Lỗi: {e}",
    "st.standby": "trực lệnh", "st.working": "đang làm", "st.ask": "cần chỉ huy", "st.done": "chờ lệnh", "st.idle": "ngủ đông", "st.blocked": "bị chặn", "st.offline": "rời trạm",
  },
  en: {
    commander: "Commander", title: "Orbit Station",
    "order.header": "📡 ORBIT STATION — {n} new order(s) for this session:",
    "order.from": "[{id}] from {from}:",
    "order.footer": "Carry out the order(s) above as a normal user request. If the MCP tool \"orbit_done\" is available, call it with the message id and a one-line result when you are done.",
    "note.done": "Done", "note.turnDone": "Turn finished", "note.cancelled": "Cancelled", "note.wakeFailed": "Wake failed: {e}",
    "copy.name": "{n} ⧉", "copy.title": "Copy running order “{t}” · claude attach {id}", "session": "Session",
    "err.badRequest": "Invalid request", "err.noAgent": "No such astronaut", "err.emptyText": "Order is empty or longer than 4000 characters",
    "err.cancelPending": "Only undelivered orders can be cancelled", "err.wakeOff": "Waking sessions is off — orders are delivered through hooks.",
    "err.working": "Session is working — the order will be delivered when it finishes its turn (needs hooks)", "err.noPending": "No orders waiting for delivery",
    "err.noCwd": "Unknown working folder for this session", "err.noClaude": "The claude command was not found. Set \"claudePath\" in config.json.",
    "err.claudeBroken": "The claude command failed to run: {e}", "err.findingClaude": "Looking for the claude command…",
    "err.badDir": "Invalid folder — enter an absolute path to an existing folder", "err.badMode": "Invalid launch mode",
    "err.noDesktop": "Opening in the Claude desktop app is macOS-only — choose background",
    "err.noTerminal": "Opening a Terminal window is macOS-only — choose background", "err.noBg": "This Claude Code has no --bg — choose Terminal",
    "err.needPrompt": "Background needs a first prompt", "err.promptLong": "The prompt is longer than 4000 characters", "err.demoLaunch": "Demo mode can't open real sessions",
    "err.notFound": "Not found", "err.method": "Not supported", "err.tooLong": "too long", "err.hookSecret": "Bad hook secret",
    "cfg.syntax": "config.json has a syntax error: {e}",
    "con.portBusy": "Port {p} is busy. Change \"port\" in config.json or run ORBIT_PORT=7800 npm start",
    "con.demo": " · DEMO MODE", "con.open": "Open:         ", "con.watch": "Watching:     ", "con.all": "all projects in {d}",
    "con.crew": "Crew:         ", "con.crewN": "{n} sessions active in the last {h} h",
    "mask.secret": "‹hidden›", "mask.key": "‹key›", "mask.private": "‹private key›", "todo": "{n} todos",
    "hk.readFail": "Couldn't read {f}: {e}. Nothing was changed.", "hk.backup": "Backed up: {f}",
    "hk.installed": "✅ Installed Orbit Station hooks for {n} events in {f}", "hk.node": "Node used by the hook: {p}",
    "hk.newSessions": "Claude Code sessions opened from now on get instant signals and receive orders from the station.",
    "hk.openSessions": "Sessions already open: type /hooks in that session (or restart it) to load the hooks.",
    "hk.removed": "Removed {n} Orbit Station hook(s) from {f}", "hk.none": "No Orbit Station hooks to remove.",
    "hk.file": "File: {f}", "hk.for": "Installed for: {e}", "hk.missing": "Orbit Station hooks are not installed (npm run hooks:install).",
    "hk.stale": "⚠️  The hook points to a different Node binary — run npm run hooks:install again if you changed Node versions.",
    "mi.run": "Running: {c}", "mi.noClaude": "The `claude` command is not in PATH. Run the line above in a terminal yourself.",
    "mcp.noSession": "Couldn't tell which session this is. Pass the session parameter (first 8 characters of the session id, shown on the station).",
    "mcp.empty": "Inbox is empty (session {s}).", "mcp.noOrder": "No order {id}.", "mcp.marked": "Marked {id} as done.",
    "mcp.offline": "Orbit Station is not running (npm start).", "mcp.noRecipient": "Nobody called \"{n}\". On board: {list}",
    "mcp.sent": "Sent {id} to {n}. It will be delivered when {n} finishes its current turn.", "mcp.reported": "Report sent to the bridge.",
    "mcp.emptyStation": "The station is empty.", "mcp.noTool": "No tool named {n}", "mcp.error": "Error: {e}",
    "st.standby": "standby", "st.working": "working", "st.ask": "needs commander", "st.done": "ready", "st.idle": "hibernating", "st.blocked": "blocked", "st.offline": "offline",
  },
};

const DEFAULT_COMMANDERS = new Set(["Chỉ huy", "Commander"]);

function systemLang() {
  const env = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || "";
  let loc = env;
  if (!loc || /^(C|POSIX)(\.|$)/.test(loc)) { try { loc = Intl.DateTimeFormat().resolvedOptions().locale; } catch { loc = "en"; } }
  return /^vi/i.test(loc) ? "vi" : "en";
}

const pick = (l) => (DICT[l] ? l : null);
let current = null;
function setLang(l) { current = pick(l) || systemLang(); return current; }
function getLang() { return current || setLang("auto"); }

function tr(lang, key, p = {}) {
  const d = DICT[pick(lang) || getLang()];
  const s = d[key] ?? DICT.en[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (p[k] ?? ""));
}
const t = (key, p) => tr(getLang(), key, p);

// tên chỉ huy: giữ tên riêng người dùng đặt, còn tên mặc định thì dịch
const commanderName = (name, lang) => (!name || DEFAULT_COMMANDERS.has(name) ? tr(lang, "commander") : name);

// lỗi có mã để giao diện dịch theo ngôn ngữ người xem
function codedError(code, p) { const e = new Error(t("err." + code, p)); e.code = code; return e; }

module.exports = { t, tr, setLang, getLang, systemLang, commanderName, codedError, LANGS: Object.keys(DICT) };
