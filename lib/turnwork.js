"use strict";
// Dữ liệu cho panel chi tiết lấy từ các tool_use trong nhật ký: danh sách việc (TodoWrite / update_plan)
// và tổng kết lượt hiện tại (số lệnh, file sửa, dòng thêm/bớt). Mọi hàm trả về giá trị mới, không sửa đầu vào.
const path = require("path");
const { mask, clip } = require("./util");

const MAX_ITEMS = 20, MAX_FILES = 50;
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

const emptyWork = () => ({ tools: 0, commands: 0, files: [], add: 0, del: 0 });

const toLines = (s) => (typeof s === "string" && s ? s.replace(/\n$/, "").split("\n") : []);
const countLines = (lines) => lines.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());

// Số dòng thêm/bớt khi đổi `from` thành `to`, tính theo tập dòng (xấp xỉ, không cần chạy diff).
function lineDiff(from, to) {
  const a = countLines(toLines(from)), b = countLines(toLines(to));
  let add = 0, del = 0;
  for (const [l, n] of b) add += Math.max(0, n - (a.get(l) || 0));
  for (const [l, n] of a) del += Math.max(0, n - (b.get(l) || 0));
  return { add, del };
}

function editDelta(name, input) {
  if (name === "Write") return { add: toLines(input.content).length, del: 0 };
  if (name === "NotebookEdit") return { add: toLines(input.new_source).length, del: 0 };
  const edits = name === "MultiEdit" && Array.isArray(input.edits) ? input.edits : [input];
  return edits.reduce((s, e) => { const d = lineDiff(e.old_string, e.new_string); return { add: s.add + d.add, del: s.del + d.del }; }, { add: 0, del: 0 });
}

function addWork(work, name, input = {}) {
  const next = { ...work, tools: work.tools + 1 };
  if (name === "Bash") next.commands = work.commands + 1;
  if (EDIT_TOOLS.has(name)) {
    const d = editDelta(name, input), file = input.file_path || input.notebook_path;
    next.add = work.add + d.add; next.del = work.del + d.del;
    if (file && !work.files.includes(file)) next.files = [...work.files, file].slice(-MAX_FILES);
  }
  return next;
}

const STATUSES = new Set(["pending", "in_progress", "completed"]);
const item = (x) => ({ text: clip(mask(String(x.content || "")), 160), status: STATUSES.has(x.status) ? x.status : "pending", active: x.activeForm ? clip(mask(String(x.activeForm)), 160) : "" });
const withStatus = (plan, i, status) => plan.map((x, k) => (k === i ? { ...x, status } : x));

// update_plan gửi cả danh sách ({items}) hoặc chỉ cập nhật: {advance}, {done:[số thứ tự từ 1]}, {start}.
function applyUpdatePlan(plan, input) {
  if (Array.isArray(input.items)) return input.items.slice(0, MAX_ITEMS).map(item);
  let next = plan;
  if (input.advance) {
    const cur = next.findIndex((x) => x.status === "in_progress");
    if (cur >= 0) next = withStatus(next, cur, "completed");
    const nxt = next.findIndex((x) => x.status === "pending");
    if (nxt >= 0) next = withStatus(next, nxt, "in_progress");
  }
  for (const n of Array.isArray(input.done) ? input.done : []) if (next[n - 1]) next = withStatus(next, n - 1, "completed");
  if (Number.isInteger(input.start) && next[input.start - 1]) next = withStatus(next, input.start - 1, "in_progress");
  return next;
}

// Trả về danh sách việc mới, hoặc `plan` cũ nếu đây không phải công cụ quản lý việc.
function applyPlan(plan, name, input = {}) {
  if (name === "TodoWrite" && Array.isArray(input.todos)) return input.todos.slice(0, MAX_ITEMS).map(item);
  if (/(^|__)update_plan$/.test(name)) return applyUpdatePlan(plan, input);
  // wrap_up tự check xong cả danh sách trong app, nhưng không có lệnh update_plan nào đi kèm
  if (/(^|__)wrap_up$/.test(name)) return plan.map((x) => (x.status === "completed" ? x : { ...x, status: "completed" }));
  return plan;
}

const workSummary = (w) => ({ tools: w.tools, commands: w.commands, files: w.files.length, fileNames: w.files.slice(-5).map((f) => path.basename(f)), add: w.add, del: w.del });

module.exports = { emptyWork, addWork, applyPlan, lineDiff, workSummary };
