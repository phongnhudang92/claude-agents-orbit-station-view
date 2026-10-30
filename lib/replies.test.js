"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { emptyReplies, pushReply, pageReplies, findReply, CAP } = require("./replies");

const fill = (n) => Array.from({ length: n }, (_, i) => i + 1).reduce((s, i) => pushReply(s, `reply ${i}`, i * 1000), emptyReplies());

test("pushReply numbers replies, skips empty and repeated text, and never mutates", () => {
  const a = pushReply(emptyReplies(), "hello", 1);
  const b = pushReply(a, "hello", 2);
  const c = pushReply(b, "", 3);
  const d = pushReply(c, "world", 4);
  assert.equal(b, a); assert.equal(c, a);
  assert.deepEqual(d.list.map((r) => r.seq), [1, 2]);
  assert.equal(a.list.length, 1);
});

test("pushReply keeps only the newest CAP replies but seq keeps counting", () => {
  const s = fill(CAP + 5);
  assert.equal(s.list.length, CAP);
  assert.equal(s.seq, CAP + 5);
  assert.equal(s.list[0].seq, 6);
});

test("pageReplies returns older replies newest-first and reports more", () => {
  const s = fill(10);
  const p1 = pageReplies(s, 10, 4);
  assert.deepEqual(p1.items.map((r) => r.seq), [9, 8, 7, 6]);
  assert.equal(p1.more, true);
  const p2 = pageReplies(s, 6, 4);
  assert.deepEqual(p2.items.map((r) => r.seq), [5, 4, 3, 2]);
  assert.equal(p2.more, true);
  const p3 = pageReplies(s, 2, 4);
  assert.deepEqual(p3.items.map((r) => r.seq), [1]);
  assert.equal(p3.more, false);
});

test("pageReplies marks long replies and trims their preview", () => {
  const s = pushReply(emptyReplies(), "x".repeat(5000), 1);
  const { items } = pageReplies(s, 2, 5);
  assert.equal(items[0].long, true);
  assert.equal(items[0].text.length, 1500);
  assert.equal(findReply(s, 1).text.length, 5000);
  assert.equal(findReply(s, 99), null);
});
