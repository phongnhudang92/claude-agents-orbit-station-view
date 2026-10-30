"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { emptyWork, addWork, applyPlan, lineDiff, workSummary } = require("./turnwork");

test("lineDiff counts only lines that changed", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nB\nc\nd"), { add: 2, del: 1 });
  assert.deepEqual(lineDiff("", "x\ny"), { add: 2, del: 0 });
  assert.deepEqual(lineDiff("x\ny\n", ""), { add: 0, del: 2 });
  assert.deepEqual(lineDiff("same", "same"), { add: 0, del: 0 });
});

test("addWork counts Bash commands, distinct edited files and line changes", () => {
  let w = emptyWork();
  w = addWork(w, "Bash", { command: "ls" });
  w = addWork(w, "Read", { file_path: "/a.js" });
  w = addWork(w, "Edit", { file_path: "/a.js", old_string: "x", new_string: "x\ny" });
  w = addWork(w, "Write", { file_path: "/b.js", content: "1\n2\n3\n" });
  w = addWork(w, "Edit", { file_path: "/a.js", old_string: "y", new_string: "z" });
  assert.deepEqual(workSummary(w), { tools: 5, commands: 1, files: 2, fileNames: ["a.js", "b.js"], add: 5, del: 1 });
});

test("addWork handles MultiEdit and does not mutate its input", () => {
  const before = emptyWork();
  const after = addWork(before, "MultiEdit", { file_path: "/m.js", edits: [{ old_string: "a", new_string: "b" }, { old_string: "", new_string: "c" }] });
  assert.equal(after.add, 2); assert.equal(after.del, 1);
  assert.deepEqual(before, emptyWork());
});

test("TodoWrite replaces the plan and keeps activeForm", () => {
  const plan = applyPlan([], "TodoWrite", { todos: [{ content: "A", status: "in_progress", activeForm: "Doing A" }, { content: "B", status: "weird" }] });
  assert.deepEqual(plan, [{ text: "A", status: "in_progress", active: "Doing A" }, { text: "B", status: "pending", active: "" }]);
});

test("update_plan supports full lists and incremental advance/done/start", () => {
  const full = applyPlan([], "mcp__ccd_turn__update_plan", { items: [{ content: "one", status: "in_progress" }, { content: "two", status: "pending" }, { content: "three", status: "pending" }] });
  const adv = applyPlan(full, "mcp__ccd_turn__update_plan", { advance: true });
  assert.deepEqual(adv.map((x) => x.status), ["completed", "in_progress", "pending"]);
  const out = applyPlan(adv, "mcp__ccd_turn__update_plan", { done: [2], start: 3 });
  assert.deepEqual(out.map((x) => x.status), ["completed", "completed", "in_progress"]);
  assert.deepEqual(full.map((x) => x.status), ["in_progress", "pending", "pending"]);
});

test("incremental update without a base plan and unrelated tools leave the plan alone", () => {
  assert.deepEqual(applyPlan([], "mcp__ccd_turn__update_plan", { advance: true }), []);
  const plan = [{ text: "A", status: "pending", active: "" }];
  assert.equal(applyPlan(plan, "Bash", { command: "ls" }), plan);
});

test("wrap_up completes every item of the plan", () => {
  const plan = applyPlan([], "mcp__ccd_turn__update_plan", { items: [{ content: "a", status: "completed" }, { content: "b", status: "in_progress" }, { content: "c", status: "pending" }] });
  const done = applyPlan(plan, "mcp__ccd_turn__wrap_up", { recap: "done" });
  assert.deepEqual(done.map((x) => x.status), ["completed", "completed", "completed"]);
  assert.deepEqual(plan.map((x) => x.status), ["completed", "in_progress", "pending"]);
  assert.deepEqual(applyPlan([], "mcp__ccd_turn__wrap_up", {}), []);
});
